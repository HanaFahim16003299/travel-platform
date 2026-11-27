import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { NotificationType } from '../notifications/notification-types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BookingGatewayRegistry } from './booking-gateway.registry.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { BookingType, PaymentStatus } from './enums/payment.enums.js';
import { RefundsService } from './refunds.service.js';
import { Payment } from './schemas/payment.schema.js';
import type { PaymentDocument } from './schemas/payment.schema.js';
import { toMinorUnits } from './utils/currency.util.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    private readonly gatewayRegistry: BookingGatewayRegistry,
    private readonly refundsService: RefundsService,
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

  private validateObjectId(id: string, label = 'ID'): Types.ObjectId {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return new Types.ObjectId(id);
  }

  async createPayment(user: AuthUser, dto: CreatePaymentDto) {
    const bookingObjectId = this.validateObjectId(dto.bookingId, 'booking ID');
    const gateway = this.gatewayRegistry.get(dto.bookingType);
    const payable = await gateway.getPayableBooking(dto.bookingId);

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
      amount: toMinorUnits(payable.amount, payable.currency),
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
    if (payment.status !== PaymentStatus.Failed && payment.status !== PaymentStatus.Pending) {
      throw new ConflictException(`Cannot retry a payment with status ${payment.status}`);
    }

    const gateway = this.gatewayRegistry.get(payment.bookingType);
    const payable = await gateway.getPayableBooking(String(payment.bookingId));
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
      amount: toMinorUnits(payable.amount, payable.currency),
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

  private async onPaymentSucceeded(intent: Stripe.PaymentIntent) {
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intent.id });
    if (!payment) {
      this.logger.warn(`No payment record found for PaymentIntent ${intent.id}`);
      return;
    }

    if (payment.status === PaymentStatus.Succeeded) {
      return;
    }

    payment.status = PaymentStatus.Succeeded;
    payment.paidAt = new Date();
    payment.failureReason = undefined;
    await payment.save();

    const bookingId = String(payment.bookingId);
    const gateway = this.gatewayRegistry.get(payment.bookingType);
    const confirmed = await gateway.confirmAfterPayment(bookingId, String(payment._id));

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

    await this.refundsService.issueExpiredHoldRefund(payment, intent.id);
  }

  private async onPaymentFailed(intent: Stripe.PaymentIntent) {
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intent.id });
    if (!payment || payment.status === PaymentStatus.Succeeded) return;

    payment.status = PaymentStatus.Failed;
    payment.failureReason = intent.last_payment_error?.message ?? 'Payment failed';
    await payment.save();

    await this.releaseExpiredInventory(payment.bookingType, String(payment.bookingId));

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

    await this.releaseExpiredInventory(payment.bookingType, String(payment.bookingId));
  }

  private async releaseExpiredInventory(bookingType: BookingType, bookingId: string) {
    try {
      await this.gatewayRegistry.get(bookingType).expireIfDue(bookingId);
    } catch {
      // Booking may still be within its active hold window or already released
    }
  }
}
