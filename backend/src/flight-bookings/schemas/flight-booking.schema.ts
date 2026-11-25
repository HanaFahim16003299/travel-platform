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

/**
 * One leg of the trip. Prices and airline policies are COPIED here when the
 * booking is created, so later changes by the airline don't affect this booking.
 */
@Schema({ _id: false })
export class Segment {
  @Prop({ type: Types.ObjectId, ref: 'Flight', required: true }) flightId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) cabinId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Airline', required: true }) airlineId: Types.ObjectId;
  @Prop({ required: true }) flightNumber: string;
  @Prop({ type: Types.ObjectId, required: true }) departureAirportId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) arrivalAirportId: Types.ObjectId;
  @Prop({ required: true }) departureAt: Date;
  @Prop({ required: true }) arrivalAt: Date;
  @Prop({ required: true }) cabinClass: string;
  @Prop({ required: true }) unitPrice: number;

  // Baggage snapshot
  @Prop({ default: 0 }) freeCheckedBags: number;
  @Prop() checkedBagWeightKg?: number;
  @Prop({ default: 0 }) extraBagPrice: number;
  @Prop({ default: 0 }) maxExtraBags: number;

  // Cancellation snapshot: tiers (FLT-09) if the airline has them,
  // otherwise the airline's single-rule policy.
  @Prop({ type: [CancellationTierSchema], default: [] }) cancellationTiers: CancellationTier[];
  @Prop({ default: false }) refundable: boolean;
  @Prop({ default: 0 }) refundPercentage: number;
  @Prop({ default: 0 }) cancellationFee: number;
  @Prop({ default: 0 }) cancellationDeadlineHours: number;
}
const SegmentSchema = SchemaFactory.createForClass(Segment);

@Schema({ timestamps: true })
export class FlightBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  // Outbound flight + cabin at the top level: Mahmoud's moderator endpoints read flightId
  @Prop({ type: Types.ObjectId, ref: 'Flight', required: true, index: true })
  flightId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  cabinId: Types.ObjectId;

  @Prop({ type: [SegmentSchema], required: true }) segments: Segment[];
  @Prop({ type: [PassengerSchema], required: true }) passengers: Passenger[];
  @Prop({ required: true, min: 1 }) seatCount: number; // adults + children (infants take no seat)

  @Prop({ type: String, enum: FlightBookingStatus, default: FlightBookingStatus.DRAFT, index: true })
  status: FlightBookingStatus;

  @Prop() draftExpiresAt?: Date;
  @Prop({ index: true }) holdExpiresAt?: Date;

  @Prop({ required: true }) baseFare: number;
  @Prop({ required: true }) baggageFees: number;
  @Prop({ required: true }) totalPrice: number;
  @Prop({ required: true }) currency: string;

  @Prop({ unique: true, sparse: true }) bookingReference?: string;
  @Prop() paymentId?: string;
  @Prop() confirmedAt?: Date;
  @Prop() cancelledAt?: Date;
  @Prop() refundAmount?: number;
  @Prop() refundId?: string;

  // Set by Mongoose because of timestamps: true
  createdAt?: Date;
  updatedAt?: Date;
}

export type FlightBookingDocument = HydratedDocument<FlightBooking>;
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);

// Drafts delete themselves after draftExpiresAt. Only drafts have this field,
// and drafts hold no seats, so nothing leaks.
FlightBookingSchema.index({ draftExpiresAt: 1 }, { expireAfterSeconds: 0 });
FlightBookingSchema.index({ 'segments.flightId': 1, status: 1 });
