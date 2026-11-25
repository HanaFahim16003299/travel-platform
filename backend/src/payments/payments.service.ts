import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import Stripe from 'stripe';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service.js';
import { HotelBookingsService } from '../hotel-bookings/hotel-bookings.service.js';
import { NotificationType } from '../notifications/notification-types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums.js';
import { Payment } from './schemas/payment.schema.js';
import type { PaymentDocument } from './schemas/payment.schema.js';
import { Refund } from './schemas/refund.schema.js';
import type { RefundDocument } from './schemas/refund.schema.js';

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW',
  'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
    @Inject(forwardRef(() => FlightBookingsService))
    private readonly flightBookingsService: FlightBookingsService,
    @Inject(forwardRef(() => HotelBookingsService))
    private readonly hotelBookingsService: HotelBookingsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured (missing STRIPE_SECRET_KEY)');
    }
    return this.stripe;
  }

  private toMinorUnits(amount: number, currency: string): number {
    const code = currency.toUpperCase();
    return ZERO_DECIMAL_CURRENCIES.has(code) ? Math.round(amount) : Math.round(amount * 100);
  }

  private validateObjectId(id: string, label = 'ID'): Types.ObjectId {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return new Types.ObjectId(id);
  }

  // ---------------------------------------------------------------------------
  // PAY-02: Policy display & acceptance
  // ---------------------------------------------------------------------------

  getBookingPolicies(user: AuthUser, type: BookingType, bookingId: string) {
    if (type === BookingType.Flight) {
      return this.flightBookingsService.getPolicies(user, bookingId);
    }
    return this.hotelBookingsService.getPolicies(user, bookingId);
  }

  acceptBookingPolicies(user: AuthUser, type: BookingType, bookingId: string) {
    if (type === BookingType.Flight) {
      return this.flightBookingsService.acceptPolicies(user, bookingId);
    }
    return this.hotelBookingsService.acceptPolicies(user, bookingId);
  }

  // ---------------------------------------------------------------------------
  // PAY-01: Stripe payment creation, retry, inspection, and webhook
  // ---------------------------------------------------------------------------

  private getPayableBooking(type: BookingType, bookingId: string) {
    if (type === BookingType.Flight) {
      return this.flightBookingsService.getPayableBooking(bookingId);
    }
    return this.hotelBookingsService.getPayableBooking(bookingId);
  }

  async createPayment(user: AuthUser, dto: CreatePaymentDto) {
    const bookingObjectId = this.validateObjectId(dto.bookingId, 'booking ID');
    const payable = await this.getPayableBooking(dto.bookingType, dto.bookingId);

    if (payable.userId !== user.id) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    if (!payable.policyAcceptedAt) {
      throw new ConflictException('Provider policies must be accepted before payment');
    }
    if (payable.amount <= 0) {
      throw new BadRequestException('Booking total amount must be greater than zero');
    }

    const existing = await this.paymentModel.findOne({
      bookingType: dto.bookingType,
      bookingId: bookingObjectId,
      status: { $in: [PaymentStatus.Succeeded, PaymentStatus.Pending, PaymentStatus.Processing] },
    });

    if (existing) {
      if (existing.status === PaymentStatus.Succeeded) {
        throw new ConflictException('This booking has already been paid');
      }
      return existing;
    }

    const stripe = this.getStripe();
    const payment = new this.paymentModel({
      userId: new Types.ObjectId(user.id),
      bookingType: dto.bookingType,
      bookingId: bookingObjectId,
      amount: payable.amount,
      currency: payable.currency.toUpperCase(),
      status: PaymentStatus.Pending,
      policyAcceptedAt: payable.policyAcceptedAt,
      attemptCount: 1,
    });

    const intent = await stripe.paymentIntents.create({
      amount: this.toMinorUnits(payable.amount, payable.currency),
      currency: payable.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        paymentId: String(payment._id),
        bookingType: dto.bookingType,
        bookingId: dto.bookingId,
        userId: user.id,
      },
    });

    payment.stripePaymentIntentId = intent.id;
    payment.clientSecret = intent.client_secret ?? undefined;
    await payment.save();
    return payment;
  }

  async retryPayment(user: AuthUser, id: string) {
    const paymentId = this.validateObjectId(id, 'payment ID');
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (String(payment.userId) !== user.id) {
      throw new ForbiddenException('You do not have access to this payment');
    }
    if (
      payment.status !== PaymentStatus.Failed &&
      payment.status !== PaymentStatus.Pending
    ) {
      throw new ConflictException(`Cannot retry a payment with status ${payment.status}`);
    }

    const payable = await this.getPayableBooking(
      payment.bookingType,
      String(payment.bookingId),
    );
    if (!payable.policyAcceptedAt) {
      throw new ConflictException('Provider policies must be accepted before payment');
    }

    const stripe = this.getStripe();

    if (payment.stripePaymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
      } catch {
        // Previous intent may already be failed or canceled
      }
    }

    const intent = await stripe.paymentIntents.create({
      amount: this.toMinorUnits(payable.amount, payable.currency),
      currency: payable.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        paymentId: String(payment._id),
        bookingType: payment.bookingType,
        bookingId: String(payment.bookingId),
        userId: user.id,
      },
    });

    payment.stripePaymentIntentId = intent.id;
    payment.clientSecret = intent.client_secret ?? undefined;
    payment.status = PaymentStatus.Pending;
    payment.failureReason = undefined;
    payment.attemptCount += 1;
    await payment.save();
    return payment;
  }

  async getPayment(user: AuthUser, id: string) {
    const paymentId = this.validateObjectId(id, 'payment ID');
    const payment = await this.paymentModel.findById(paymentId).lean();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (String(payment.userId) !== user.id && user.role !== Role.Admin) {
      throw new ForbiddenException('You do not have access to this payment');
    }
    return payment;
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.getStripe();
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid signature';
      throw new BadRequestException(`Webhook signature verification failed: ${msg}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentFailed(event.data.object);
        break;
      case 'payment_intent.canceled':
        await this.onPaymentCanceled(event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true, eventType: event.type };
  }

  private async onPaymentSucceeded(intent: Stripe.PaymentIntent) {
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intent.id });
    if (!payment) {
      this.logger.warn(`No payment record found for PaymentIntent ${intent.id}`);
      return;
    }

    if (payment.status === PaymentStatus.Succeeded) {
      return; // Idempotent webhook handling
    }

    payment.status = PaymentStatus.Succeeded;
    payment.paidAt = new Date();
    payment.failureReason = undefined;
    await payment.save();

    const bookingId = String(payment.bookingId);
    let confirmed = false;

    if (payment.bookingType === BookingType.Flight) {
      const result = await this.flightBookingsService.confirmAfterPayment(
        bookingId,
        String(payment._id),
      );
      confirmed = result !== null;
    } else {
      try {
        await this.hotelBookingsService.confirmBooking(bookingId, String(payment._id));
        confirmed = true;
      } catch (err) {
        this.logger.warn(
          `Hotel booking ${bookingId} could not be confirmed after payment: ${err instanceof Error ? err.message : String(err)}`,
        );
        confirmed = false;
      }
    }

    if (confirmed) {
      await this.notificationsService.create({
        userId: String(payment.userId),
        type: NotificationType.PaymentUpdate,
        title: 'Payment succeeded',
        message: `Your payment of ${payment.amount} ${payment.currency} was verified and your booking is confirmed.`,
        referenceType: payment.bookingType === BookingType.Flight ? 'flight_booking' : 'hotel_booking',
        referenceId: bookingId,
      });
      return;
    }

    // Hold expired before webhook arrived: refund automatically so user is not charged
    await this.issueExpiredHoldRefund(payment, intent.id);
  }

  private async issueExpiredHoldRefund(payment: PaymentDocument, intentId: string) {
    const stripe = this.getStripe();
    const refundDoc = new this.refundModel({
      userId: payment.userId,
      paymentId: payment._id,
      bookingType: payment.bookingType,
      bookingId: payment.bookingId,
      amount: payment.amount,
      currency: payment.currency,
      reason: 'Booking hold expired before payment confirmation',
      status: RefundStatus.Pending,
    });

    try {
      const stripeRefund = await stripe.refunds.create({ payment_intent: intentId });
      refundDoc.stripeRefundId = stripeRefund.id;
      refundDoc.status = RefundStatus.Succeeded;
      refundDoc.processedAt = new Date();
      payment.status = PaymentStatus.Refunded;
      await payment.save();
    } catch (err) {
      refundDoc.status = RefundStatus.Failed;
      refundDoc.failureReason = err instanceof Error ? err.message : 'Stripe refund failed';
    }
    await refundDoc.save();

    await this.notificationsService.create({
      userId: String(payment.userId),
      type: NotificationType.RefundUpdate,
      title: 'Booking hold expired — automatic refund',
      message: `Your hold for ${payment.bookingType} booking expired before payment completed, so a full refund of ${payment.amount} ${payment.currency} was initiated.`,
      referenceType: 'refund',
      referenceId: String(refundDoc._id),
    });
  }

  private async onPaymentFailed(intent: Stripe.PaymentIntent) {
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intent.id });
    if (!payment || payment.status === PaymentStatus.Succeeded) return;

    payment.status = PaymentStatus.Failed;
    payment.failureReason = intent.last_payment_error?.message ?? 'Payment failed';
    await payment.save();

    await this.releaseExpiredBookingInventory(payment.bookingType, String(payment.bookingId));

    await this.notificationsService.create({
      userId: String(payment.userId),
      type: NotificationType.PaymentUpdate,
      title: 'Payment failed',
      message: `Your payment of ${payment.amount} ${payment.currency} failed: ${payment.failureReason}`,
      referenceType: 'payment',
      referenceId: String(payment._id),
    });
  }

  private async onPaymentCanceled(intent: Stripe.PaymentIntent) {
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intent.id });
    if (!payment || payment.status === PaymentStatus.Succeeded) return;

    payment.status = PaymentStatus.Cancelled;
    payment.cancelledAt = new Date();
    await payment.save();

    await this.releaseExpiredBookingInventory(payment.bookingType, String(payment.bookingId));
  }

  private async releaseExpiredBookingInventory(bookingType: BookingType, bookingId: string) {
    try {
      if (bookingType === BookingType.Flight) {
        await this.flightBookingsService.expireIfDue(bookingId);
      } else {
        await this.hotelBookingsService.expireBooking(bookingId);
      }
    } catch {
      // Booking may still be within its active hold window or already released
    }
  }

  // ---------------------------------------------------------------------------
  // PAY-03: Refunds & PaymentIntent cancellation (called by booking services)
  // ---------------------------------------------------------------------------

  async getRefund(user: AuthUser, id: string) {
    const refundId = this.validateObjectId(id, 'refund ID');
    const refund = await this.refundModel.findById(refundId).lean();
    if (!refund) {
      throw new NotFoundException('Refund not found');
    }
    if (String(refund.userId) !== user.id && user.role !== Role.Admin) {
      throw new ForbiddenException('You do not have access to this refund');
    }
    return refund;
  }

  async cancelPendingPaymentForBooking(bookingType: BookingType, bookingId: string) {
    if (!isValidObjectId(bookingId)) return;
    const payment = await this.paymentModel.findOne({
      bookingType,
      bookingId: new Types.ObjectId(bookingId),
      status: { $in: [PaymentStatus.Pending, PaymentStatus.Processing] },
    });
    if (!payment) return;

    if (payment.stripePaymentIntentId && this.stripe) {
      try {
        await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
      } catch (err) {
        this.logger.warn(
          `Could not cancel PaymentIntent ${payment.stripePaymentIntentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    payment.status = PaymentStatus.Cancelled;
    payment.cancelledAt = new Date();
    await payment.save();
  }

  async processRefundForBooking(input: {
    bookingType: BookingType;
    bookingId: string;
    userId: string;
    amount: number;
    currency: string;
    reason?: string;
  }) {
    if (input.amount <= 0) return null;

    const bookingObjectId = this.validateObjectId(input.bookingId, 'booking ID');
    const payment = await this.paymentModel.findOne({
      bookingType: input.bookingType,
      bookingId: bookingObjectId,
      status: { $in: [PaymentStatus.Succeeded, PaymentStatus.PartiallyRefunded] },
    });

    if (!payment || !payment.stripePaymentIntentId) {
      this.logger.warn(
        `No succeeded payment found for ${input.bookingType} booking ${input.bookingId}; skipping Stripe refund`,
      );
      return null;
    }

    const refundDoc = new this.refundModel({
      userId: new Types.ObjectId(input.userId),
      paymentId: payment._id,
      bookingType: input.bookingType,
      bookingId: bookingObjectId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      reason: input.reason,
      status: RefundStatus.Pending,
    });

    try {
      const stripe = this.getStripe();
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: this.toMinorUnits(input.amount, input.currency),
      });
      refundDoc.stripeRefundId = stripeRefund.id;
      refundDoc.status = RefundStatus.Succeeded;
      refundDoc.processedAt = new Date();

      payment.status =
        input.amount >= payment.amount
          ? PaymentStatus.Refunded
          : PaymentStatus.PartiallyRefunded;
      await payment.save();
    } catch (err) {
      refundDoc.status = RefundStatus.Failed;
      refundDoc.failureReason = err instanceof Error ? err.message : 'Stripe refund failed';
    }

    await refundDoc.save();

    await this.notificationsService.create({
      userId: input.userId,
      type: NotificationType.RefundUpdate,
      title: refundDoc.status === RefundStatus.Succeeded ? 'Refund processed' : 'Refund failed',
      message:
        refundDoc.status === RefundStatus.Succeeded
          ? `Your refund of ${input.amount} ${input.currency.toUpperCase()} has been processed.`
          : `Your refund of ${input.amount} ${input.currency.toUpperCase()} could not be processed automatically.`,
      referenceType: 'refund',
      referenceId: String(refundDoc._id),
    });

    return refundDoc;
  }
}
