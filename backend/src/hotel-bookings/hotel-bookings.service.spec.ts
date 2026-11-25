import { InternalServerErrorException } from '@nestjs/common';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import {
  HOTEL_HOLD_MINUTES,
  MAX_BOOKING_REFERENCE_ATTEMPTS,
} from './constants.js';

const USER_ID = 'a'.repeat(24);
const HOTEL_ID = 'b'.repeat(24);
const ROOM_ID = 'c'.repeat(24);
const BOOKING_ID = 'e'.repeat(24);

function withSession(resolvedValue: unknown) {
  return { session: vi.fn().mockResolvedValue(resolvedValue) };
}

interface BuildServiceOptions {
  hotel?: unknown;
  rooms?: unknown[];
  modifiedCount?: number;
}

function buildService(options: BuildServiceOptions = {}) {
  const hotel =
    options.hotel ??
    ({
      _id: HOTEL_ID,
      isActive: true,
      policies: { cancellationTiers: [], houseRules: [] },
    } as const);

  const rooms =
    options.rooms ??
    ([
      {
        _id: ROOM_ID,
        name: 'Deluxe',
        pricePerNight: 100,
        maxAdults: 2,
        maxChildren: 1,
      },
    ] as const);

  const savedDocs: any[] = [];

  const bookingModel = vi.fn().mockImplementation(function (
    this: any,
    data: Record<string, unknown>,
  ) {
    Object.assign(this, data);
    this._id = 'd'.repeat(24);
    this.save = vi.fn().mockImplementation(async () => this);
    savedDocs.push(this);
  }) as unknown as any;

  const hotelModel = { findOne: vi.fn().mockReturnValue(withSession(hotel)) };
  const roomModel = { find: vi.fn().mockReturnValue(withSession(rooms)) };
  const availabilityModel = {
    updateMany: vi.fn().mockResolvedValue({
      modifiedCount: options.modifiedCount ?? (rooms as unknown[]).length,
    }),
  };

  const mongoSession = {
    withTransaction: (fn: () => unknown) => fn(),
    endSession: vi.fn(),
  };
  const connection = { startSession: vi.fn().mockResolvedValue(mongoSession) };

  const service = new HotelBookingsService(
    bookingModel,
    hotelModel as any,
    roomModel as any,
    availabilityModel as any,
    connection as any,
  );

  return {
    service,
    bookingModel,
    hotelModel,
    roomModel,
    availabilityModel,
    savedDocs,
  };
}

describe('HotelBookingsService.create - hold duration (HTL-18)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`holds the booking for exactly ${HOTEL_HOLD_MINUTES} minutes from now`, async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00.000Z');
    vi.setSystemTime(now);

    const { service, savedDocs } = buildService({ modifiedCount: 1 });

    await service.create(USER_ID, {
      hotelId: HOTEL_ID,
      roomIds: [ROOM_ID],
      checkIn: '2026-01-02',
      checkOut: '2026-01-03',
      guests: 2,
    } as any);

    const expected = new Date(now.getTime() + HOTEL_HOLD_MINUTES * 60 * 1000);
    expect(savedDocs[0].expiresAt).toEqual(expected);
  });
});

// ==========================================
// confirmBooking - booking reference (HTL-17)
// ==========================================

function bookingTemplate(overrides: Record<string, unknown> = {}) {
  return {
    _id: BOOKING_ID,
    hotelId: HOTEL_ID,
    status: BookingStatus.PendingPayment,
    checkIn: new Date('2026-01-02T00:00:00.000Z'),
    checkOut: new Date('2026-01-03T00:00:00.000Z'),
    rooms: [{ roomId: ROOM_ID, roomName: 'Deluxe', pricePerNight: 100 }],
    policyAcceptedAt: new Date(Date.now() - 60 * 1000),
    expiresAt: new Date(Date.now() + HOTEL_HOLD_MINUTES * 60 * 1000),
    confirmedAt: null,
    bookingReference: undefined,
    ...overrides,
  };
}

interface BuildConfirmServiceOptions {
  reservedRecords?: number;
  save?: (doc: Record<string, unknown>) => Promise<unknown>;
}

function buildConfirmService(
  template: Record<string, unknown>,
  options: BuildConfirmServiceOptions = {},
) {
  const docs: Record<string, unknown>[] = [];

  const bookingModel = {
    findById: vi.fn().mockImplementation(() => {
      const doc: Record<string, unknown> = { ...template };
      doc.save = options.save
        ? vi.fn().mockImplementation(() => options.save!(doc))
        : vi.fn().mockImplementation(async () => doc);
      docs.push(doc);
      return withSession(doc);
    }),
  };

  const availabilityModel = {
    countDocuments: vi
      .fn()
      .mockReturnValue(withSession(options.reservedRecords ?? 1)),
  };

  const startSession = vi.fn().mockImplementation(async () => ({
    withTransaction: (fn: () => unknown) => fn(),
    endSession: vi.fn(),
  }));
  const connection = { startSession };

  const service = new HotelBookingsService(
    bookingModel as any,
    {} as any,
    {} as any,
    availabilityModel as any,
    connection as any,
  );

  return { service, bookingModel, availabilityModel, connection, docs };
}

describe('HotelBookingsService.confirmBooking - booking reference (HTL-17)', () => {
  it('generates and returns a unique bookingReference on first confirm', async () => {
    const { service } = buildConfirmService(bookingTemplate());

    const result: any = await service.confirmBooking(BOOKING_ID);

    expect(result.status).toBe(BookingStatus.Confirmed);
    expect(result.bookingReference).toMatch(
      /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
    );
  });

  it('does not generate a new reference on an idempotent re-confirm', async () => {
    const { service, connection } = buildConfirmService(
      bookingTemplate({
        status: BookingStatus.Confirmed,
        bookingReference: 'ABC123',
      }),
    );

    const result: any = await service.confirmBooking(BOOKING_ID);

    expect(result.bookingReference).toBe('ABC123');
    expect(connection.startSession).toHaveBeenCalledTimes(1);
  });

  it('retries the whole transaction on a duplicate-key error until it succeeds', async () => {
    let attempts = 0;

    const { service, connection } = buildConfirmService(bookingTemplate(), {
      save: async (doc) => {
        attempts += 1;
        if (attempts < 3) {
          const duplicateKeyError = Object.assign(new Error('duplicate'), {
            code: 11000,
          });
          throw duplicateKeyError;
        }
        return doc;
      },
    });

    const result: any = await service.confirmBooking(BOOKING_ID);

    expect(attempts).toBe(3);
    expect(connection.startSession).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(BookingStatus.Confirmed);
    expect(result.bookingReference).toBeDefined();
  });

  it(`gives up after ${MAX_BOOKING_REFERENCE_ATTEMPTS} duplicate-key attempts`, async () => {
    const { service, connection } = buildConfirmService(bookingTemplate(), {
      save: async () => {
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      },
    });

    await expect(service.confirmBooking(BOOKING_ID)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(connection.startSession).toHaveBeenCalledTimes(
      MAX_BOOKING_REFERENCE_ATTEMPTS,
    );
  });

  it('does not retry on a non-duplicate-key error', async () => {
    const { service, connection } = buildConfirmService(bookingTemplate(), {
      save: async () => {
        throw new Error('disk full');
      },
    });

    await expect(service.confirmBooking(BOOKING_ID)).rejects.toThrow(
      'disk full',
    );
    expect(connection.startSession).toHaveBeenCalledTimes(1);
  });
});
