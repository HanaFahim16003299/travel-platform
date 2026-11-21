import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Room } from './room.schema.js';
import { Hotel } from './hotel.schema.js';

export type RoomAvailabilityDocument = HydratedDocument<RoomAvailability>;

@Schema({ timestamps: true })
export class RoomAvailability {
  @Prop({ type: Types.ObjectId, ref: Room.name, required: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Hotel.name, required: true })
  hotelId: Types.ObjectId;

  // Night being described, stored as UTC midnight (normalized in the service)
  @Prop({ required: true })
  date: Date;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop({ min: 0 })
  priceOverride?: number;

  // Set by the hotel-booking module when a reservation claims this night
  @Prop({ type: Types.ObjectId, ref: 'HotelBooking', default: null })
  bookingId?: Types.ObjectId | null;
}

export const RoomAvailabilitySchema =
  SchemaFactory.createForClass(RoomAvailability);

// one document per room per night
RoomAvailabilitySchema.index({ roomId: 1, date: 1 }, { unique: true });
// hotel-wide availability range queries (HTL-08)
RoomAvailabilitySchema.index({ hotelId: 1, date: 1 });
// release nights when a booking is cancelled
RoomAvailabilitySchema.index({ bookingId: 1 });
