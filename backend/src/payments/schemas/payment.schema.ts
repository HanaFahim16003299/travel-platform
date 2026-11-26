import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { BookingType, PaymentStatus } from '../enums/payment.enums.js';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(BookingType), required: true })
  bookingType: BookingType;

  @Prop({ type: Types.ObjectId, required: true })
  bookingId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, trim: true })
  currency: string;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.Pending,
    required: true,
    index: true,
  })
  status: PaymentStatus;

  @Prop({ type: String, unique: true, sparse: true })
  stripePaymentIntentId?: string;

  @Prop({ type: String })
  clientSecret?: string;

  @Prop({ type: Date, required: true })
  policyAcceptedAt: Date;

  @Prop({ type: Number, default: 1, min: 1 })
  attemptCount: number;

  @Prop({ type: String })
  failureReason?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ bookingType: 1, bookingId: 1 });
PaymentSchema.index({ userId: 1, createdAt: -1 });
