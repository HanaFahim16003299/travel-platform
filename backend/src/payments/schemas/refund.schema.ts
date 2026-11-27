import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { BookingType, RefundStatus } from '../enums/payment.enums.js';

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ timestamps: true })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true, index: true })
  paymentId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(BookingType), required: true })
  bookingType: BookingType;

  @Prop({ type: Types.ObjectId, required: true })
  bookingId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, trim: true })
  currency: string;

  @Prop({ type: String })
  reason?: string;

  @Prop({
    type: String,
    enum: Object.values(RefundStatus),
    default: RefundStatus.Pending,
    required: true,
    index: true,
  })
  status: RefundStatus;

  @Prop({ type: String, unique: true, sparse: true })
  stripeRefundId?: string;

  @Prop({ type: String })
  failureReason?: string;

  @Prop({ type: Date })
  processedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);

RefundSchema.index({ bookingType: 1, bookingId: 1 });
RefundSchema.index({ userId: 1, createdAt: -1 });
