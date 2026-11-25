import { describe, it, expect } from 'vitest';
import {
  HotelBookingSchema,
  BookedRoomSchema,
} from './hotel-booking.schema.js';

describe('HotelBookingSchema ObjectId fields', () => {
  it('stores userId, hotelId and paymentId as real ObjectIds, not Mixed', () => {
    expect(HotelBookingSchema.path('userId').instance).toBe('ObjectId');
    expect(HotelBookingSchema.path('hotelId').instance).toBe('ObjectId');
    expect(HotelBookingSchema.path('paymentId').instance).toBe('ObjectId');
  });

  it('stores BookedRoom.roomId as a real ObjectId, not Mixed', () => {
    expect(BookedRoomSchema.path('roomId').instance).toBe('ObjectId');
  });
});
