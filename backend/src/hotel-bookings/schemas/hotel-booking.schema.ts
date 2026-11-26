
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  HotelPoliciesSchema,
} from '../../hotels/schemas/hotel.schema.js';

import type {
  HotelPolicies,
} from '../../hotels/schemas/hotel.schema.js';

import { BookingStatus } from '../enums/booking-status.enum.js';

export type HotelBookingDocument =
  HydratedDocument<HotelBooking>;

// ==========================================
// BOOKED ROOM SUB-SCHEMA
// ==========================================

@Schema({ _id: false })
export class BookedRoom {
  @Prop({
    type: Types.ObjectId,
    ref: 'Room',
    required: true,
  })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  roomName: string;

  @Prop({ required: true, min: 0 })
  pricePerNight: number;
}

export const BookedRoomSchema =
  SchemaFactory.createForClass(BookedRoom);

// ==========================================
// HOTEL BOOKING SCHEMA
// ==========================================

@Schema({ timestamps: true })
export class HotelBooking {
  // Booking owner
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  // Selected hotel
  @Prop({
    type: Types.ObjectId,
    ref: 'Hotel',
    required: true,
  })
  hotelId: Types.ObjectId;

  // Selected rooms and their original prices
  @Prop({
    type: [BookedRoomSchema],
    required: true,
    validate: {
      validator: (rooms: BookedRoom[]) => rooms.length > 0,
      message: 'At least one room must be selected',
    },
  })
  rooms: BookedRoom[];

  // Stay information
  @Prop({ type: Date, required: true })
  checkIn: Date;

  @Prop({ type: Date, required: true })
  checkOut: Date;

  @Prop({ required: true, min: 1 })
  nights: number;

  @Prop({ required: true, min: 1 })
  guests: number;

  // Pricing information
  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop({
    required: true,
    default: 'USD',
    uppercase: true,
    trim: true,
  })
  currency: string;

  // Booking status
  @Prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PendingPayment,
    required: true,
  })
  status: BookingStatus;

  // Original hotel policies
  @Prop({
    type: HotelPoliciesSchema,
    required: true,
  })
  policies: HotelPolicies;

  // Payment integration
  @Prop({
    type: Types.ObjectId,
    ref: 'Payment',
    default: null,
  })
  paymentId: Types.ObjectId | null;

  // Policy acceptance timestamp
  @Prop({ type: Date, default: null })
  policyAcceptedAt: Date | null;

  // Payment deadline
  @Prop({ type: Date, required: true })
  expiresAt: Date;

  // Actual expiration timestamp
  @Prop({ type: Date, default: null })
  expiredAt: Date | null;

  // Successful confirmation timestamp
  @Prop({ type: Date, default: null })
  confirmedAt: Date | null;

  // Added by Mohamed Hesham: unique code shown to the user once the booking is confirmed (HTL-17).
  // sparse: bookings that are not confirmed yet have no code, and the
  // unique rule must ignore them.
  @Prop({ type: String, unique: true, sparse: true })
  bookingReference?: string;

  // Cancellation timestamp
@Prop({ type: Date, default: null })
cancelledAt: Date | null;

// Refund amount
@Prop({ type: Number, default: 0, min: 0 })
refundAmount: number;

// Refund percentage
@Prop({ type: Number, default: 0, min: 0, max: 100 })
refundPercent: number;

// Refund status
@Prop({
  type: String,
  enum: ['Not Required', 'Pending', 'Processed', 'Failed'],
  default: 'Not Required',
})
refundStatus: string;

// Refund request timestamp
@Prop({ type: Date, default: null })
refundRequestedAt: Date | null;

// Automatically managed by Mongoose
createdAt: Date;
updatedAt: Date;
}

export const HotelBookingSchema =
  SchemaFactory.createForClass(HotelBooking);

// ==========================================
// DATABASE INDEXES
// ==========================================

// Retrieve a user's bookings efficiently
HotelBookingSchema.index({
  userId: 1,
  createdAt: -1,
});

// Retrieve hotel reservations by status
HotelBookingSchema.index({
  hotelId: 1,
  status: 1,
});

// Find pending bookings that have expired
HotelBookingSchema.index({
  status: 1,
  expiresAt: 1,
});

// Retrieve hotel bookings within a date range
HotelBookingSchema.index({
  hotelId: 1,
  checkIn: 1,
  checkOut: 1,
});

HotelBookingSchema.index({ refundStatus: 1 });
