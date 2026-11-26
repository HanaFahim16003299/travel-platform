import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { BookingStatus } from '../hotel-bookings/enums/booking-status.enum.js';

const USER_ID = 'a'.repeat(24);
const BOOKING_ID = 'b'.repeat(24);
const HOTEL_ID = 'c'.repeat(24);

function withSession(resolvedValue: unknown) {
  return { session: vi.fn().mockResolvedValue(resolvedValue) };
}

function bookingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: BOOKING_ID,
    userId: USER_ID,
    hotelId: HOTEL_ID,
    status: BookingStatus.Confirmed,
    checkOut: new Date(Date.now() - 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function buildService(booking: Record<string, unknown>) {
  const bookingModel = {
    findById: vi.fn().mockReturnValue(withSession(booking)),
  };

  const reviewModel = Object.assign(
    vi.fn().mockImplementation(function (
      this: any,
      data: Record<string, unknown>,
    ) {
      Object.assign(this, data);
      this.save = vi.fn().mockImplementation(async () => this);
    }),
    {
      findOne: vi.fn().mockReturnValue(withSession(null)),
      aggregate: vi
        .fn()
        .mockReturnValue(withSession([{ averageRating: 4.5, reviewCount: 2 }])),
    },
  );

  const hotelModel = {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(withSession({ _id: HOTEL_ID })),
    }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
  };

  const mongoSession = {
    withTransaction: (fn: () => unknown) => fn(),
    endSession: vi.fn(),
  };
  const connection = { startSession: vi.fn().mockResolvedValue(mongoSession) };

  const service = new ReviewsService(
    reviewModel as any,
    bookingModel as any,
    hotelModel as any,
    connection as any,
  );

  return { service };
}

describe('ReviewsService.create - Confirmed or Completed bookings (HTL-23)', () => {
  it('accepts a Confirmed booking whose stay has ended', async () => {
    const { service } = buildService(
      bookingDoc({ status: BookingStatus.Confirmed }),
    );

    await expect(
      service.create(USER_ID, BOOKING_ID, {
        rating: 5,
        comment: 'Great stay',
      } as any),
    ).resolves.toBeDefined();
  });

  it('accepts a Completed booking', async () => {
    const { service } = buildService(
      bookingDoc({ status: BookingStatus.Completed }),
    );

    await expect(
      service.create(USER_ID, BOOKING_ID, {
        rating: 5,
        comment: 'Great stay',
      } as any),
    ).resolves.toBeDefined();
  });

  it('rejects a Pending Payment booking', async () => {
    const { service } = buildService(
      bookingDoc({ status: BookingStatus.PendingPayment }),
    );

    await expect(
      service.create(USER_ID, BOOKING_ID, {
        rating: 5,
        comment: 'Great stay',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still rejects a Completed booking whose checkOut is in the future', async () => {
    const { service } = buildService(
      bookingDoc({
        status: BookingStatus.Completed,
        checkOut: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    );

    await expect(
      service.create(USER_ID, BOOKING_ID, {
        rating: 5,
        comment: 'Great stay',
      } as any),
    ).rejects.toThrow(/completing your stay/i);
  });
});
