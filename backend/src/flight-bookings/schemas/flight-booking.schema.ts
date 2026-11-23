import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { FlightBookingStatus, PassengerType } from '../flight-booking.enums.js';

@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true }) daysBefore: number;
  @Prop({ required: true }) refundPercent: number;
}
const CancellationTierSchema = SchemaFactory.createForClass(CancellationTier);

@Schema({ _id: false })
export class Passenger {
  @Prop({ required: true, trim: true }) firstName: string;
  @Prop({ required: true, trim: true }) lastName: string;
  @Prop({ required: true }) dateOfBirth: Date;
  @Prop({ required: true, trim: true }) documentNumber: string;
  @Prop({ type: String, enum: PassengerType, required: true }) type: PassengerType;
  @Prop() email?: string;
  @Prop() phone?: string;
  @Prop({ default: 0, min: 0 }) extraBags: number;
  @Prop() ticketNumber?: string;
}
const PassengerSchema = SchemaFactory.createForClass(Passenger);

@Schema({ _id: false })
export class Segment {
  @Prop({ type: Types.ObjectId, ref: 'Flight', required: true }) flightId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) cabinId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Airline', required: true }) airlineId: Types.ObjectId;
  @Prop({ required: true }) cabinClass: string;
  @Prop({ required: true }) unitPrice: number;
  @Prop({ required: true }) departureAt: Date;
  @Prop({ default: 0 }) freeBags: number;
  @Prop() maxBagWeightKg?: number;
  @Prop({ default: 0 }) extraBagPrice: number;
  @Prop({ default: 0 }) maxExtraBags: number;
  @Prop({ type: [CancellationTierSchema], default: [] }) cancellationTiers: CancellationTier[];
}
const SegmentSchema = SchemaFactory.createForClass(Segment);

@Schema({ timestamps: true })
export class FlightBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Flight', required: true, index: true })
  flightId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  cabinId: Types.ObjectId;

  @Prop({ type: [SegmentSchema], required: true }) segments: Segment[];
  @Prop({ type: [PassengerSchema], required: true }) passengers: Passenger[];
  @Prop({ required: true, min: 1 }) seatCount: number;

  @Prop({ type: String, enum: FlightBookingStatus, default: FlightBookingStatus.DRAFT, index: true })
  status: FlightBookingStatus;

  @Prop() draftExpiresAt?: Date;
  @Prop({ index: true }) holdExpiresAt?: Date;

  @Prop({ required: true }) baseFare: number;
  @Prop({ required: true }) baggageFees: number;
  @Prop({ required: true }) totalPrice: number;
  @Prop({ required: true }) currency: string;

  @Prop({ unique: true, sparse: true }) bookingReference?: string;
  @Prop({ type: Types.ObjectId, ref: 'Payment' }) paymentId?: Types.ObjectId;
  @Prop() confirmedAt?: Date;
  @Prop() cancelledAt?: Date;
  @Prop() refundAmount?: number;
  @Prop({ type: Types.ObjectId, ref: 'Refund' }) refundId?: Types.ObjectId;
}

export type FlightBookingDocument = HydratedDocument<FlightBooking>;
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);

// Drafts delete themselves after draftExpiresAt (drafts hold no seats)
FlightBookingSchema.index({ draftExpiresAt: 1 }, { expireAfterSeconds: 0 });