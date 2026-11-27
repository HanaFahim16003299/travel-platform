import {
  BadRequestException,
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
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums.js';
import { Payment } from './schemas/payment.schema.js';
import type { PaymentDocument } from './schemas/payment.schema.js';
import { Refund } from './schemas/refund.schema.js';
import type { RefundDocument } from './schemas/refund.schema.js';
import { toMinorUnits } from './utils/currency.util.js';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured (missing STRIPE_SECRET_KEY)');
    }
    return this.stripe;
  }

  async getRefund(user: AuthUser, id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid refund ID');
    }
    const refund = await this.refundModel.findById(new Types.ObjectId(id)).lean();
    if (!refund) {
      throw new NotFoundException('Refund not found');
    }
    if (String(refund.userId) !== user.id && user.role !== Role.Admin) {
      throw new ForbiddenException('You do not have access to this refund');
    }
    return refund;
  }

  async issueExpiredHoldRefund(payment: PaymentDocument, intentId: string) {
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

    return refundDoc;
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
    if (!isValidObjectId(input.bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }

    const bookingObjectId = new Types.ObjectId(input.bookingId);
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
        amount: toMinorUnits(input.amount, input.currency),
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
