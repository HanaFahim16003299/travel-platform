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

function fakeNotifications() {
  return { create: vi.fn().mockResolvedValue(undefined) };
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
  const notifications = fakeNotifications();

  const service = new HotelBookingsService(
    bookingModel,
    hotelModel as any,
    roomModel as any,
    availabilityModel as any,
    connection as any,
    notifications as any,
  );

  return {
    service,
    bookingModel,
    hotelModel,
    roomModel,
    availabilityModel,
    notifications,
    savedDocs,
  };
}

function futureDateString(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function createDto(overrides: Record<string, unknown> = {}) {
  return {
    hotelId: HOTEL_ID,
    checkIn: futureDateString(1),
    checkOut: futureDateString(2),
    rooms: [{ roomId: ROOM_ID, adults: 2, childrenAges: [] }],
    ...overrides,
  } as any;
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

    await service.create(USER_ID, createDto());

    const expected = new Date(now.getTime() + HOTEL_HOLD_MINUTES * 60 * 1000);
    expect(savedDocs[0].expiresAt).toEqual(expected);
  });
});

describe('HotelBookingsService.create - adults and children per room (HTL-16)', () => {
  it('stores adults/childrenAges per room and derives guests as their sum', async () => {
    const { service, savedDocs } = buildService({
      modifiedCount: 1,
      rooms: [
        {
          _id: ROOM_ID,
          name: 'Deluxe',
          pricePerNight: 100,
          maxAdults: 2,
          maxChildren: 2,
        },
      ],
    });

    await service.create(
      USER_ID,
      createDto({
        rooms: [{ roomId: ROOM_ID, adults: 2, childrenAges: [5, 9] }],
      }),
    );

    expect(savedDocs[0].guests).toBe(4);
    expect(savedDocs[0].rooms).toEqual([
      expect.objectContaining({
        roomId: ROOM_ID,
        adults: 2,
        childrenAges: [5, 9],
      }),
    ]);
  });

  it('rejects when there is no adult across the whole reservation', async () => {
    const { service } = buildService();

    await expect(
      service.create(
        USER_ID,
        createDto({
          rooms: [{ roomId: ROOM_ID, adults: 0, childrenAges: [5] }],
        }),
      ),
    ).rejects.toThrow(/at least one adult/i);
  });

  it('rejects a duplicated roomId', async () => {
    const { service } = buildService();

    await expect(
      service.create(
        USER_ID,
        createDto({
          rooms: [
            { roomId: ROOM_ID, adults: 1, childrenAges: [] },
            { roomId: ROOM_ID, adults: 1, childrenAges: [] },
          ],
        }),
      ),
    ).rejects.toThrow(/duplicate room ids/i);
  });

  it('rejects a room whose adults + children exceed its maxAdults + maxChildren', async () => {
    const { service } = buildService({
      rooms: [
        {
          _id: ROOM_ID,
          name: 'Deluxe',
          pricePerNight: 100,
          maxAdults: 2,
          maxChildren: 1,
        },
      ],
    });

    await expect(
      service.create(
        USER_ID,
        createDto({
          rooms: [{ roomId: ROOM_ID, adults: 2, childrenAges: [5, 9] }],
        }),
      ),
    ).rejects.toThrow(/cannot hold 4 guest/i);
  });

  it('rejects a room that does not belong to the hotel or is inactive', async () => {
    const { service } = buildService({ rooms: [] });

    await expect(
      service.create(
        USER_ID,
        createDto({
          rooms: [{ roomId: ROOM_ID, adults: 1, childrenAges: [] }],
        }),
      ),
    ).rejects.toThrow(/invalid or inactive/i);
  });
});

// ==========================================
// confirmBooking - booking reference (HTL-17)
// ==========================================

function bookingTemplate(overrides: Record<string, unknown> = {}) {
  return {
    _id: BOOKING_ID,
    userId: USER_ID,
    hotelId: HOTEL_ID,
    status: BookingStatus.PendingPayment,
    checkIn: new Date('2026-01-02T00:00:00.000Z'),
    checkOut: new Date('2026-01-03T00:00:00.000Z'),
    rooms: [{ roomId: ROOM_ID, roomName: 'Deluxe', pricePerNight: 100 }],
    policyAcceptedAt: new Date(Date.now() - 60 * 1000),
    expiresAt: new Date(Date.now() + HOTEL_HOLD_MINUTES * 60 * 1000),
    confirmedAt: null,
    bookingReference: undefined,
    totalPrice: 100,
    currency: 'USD',
    ...overrides,
  };
}

interface BuildConfirmServiceOptions {
  reservedRecords?: number;
  save?: (doc: Record<string, unknown>) => Promise<unknown>;
  notifications?: { create: ReturnType<typeof vi.fn> };
  hotelName?: string;
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

  const hotelModel = {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi
          .fn()
          .mockResolvedValue({ name: options.hotelName ?? 'Test Hotel' }),
      }),
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
  const notifications = options.notifications ?? fakeNotifications();

  const service = new HotelBookingsService(
    bookingModel as any,
    hotelModel as any,
    {} as any,
    availabilityModel as any,
    connection as any,
    notifications as any,
  );

  return {
    service,
    bookingModel,
    hotelModel,
    availabilityModel,
    connection,
    notifications,
    docs,
  };
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

describe('HotelBookingsService.confirmBooking - notification (HTL-17)', () => {
  it('sends an in-app notification once, after the first confirm', async () => {
    const { service, notifications } = buildConfirmService(bookingTemplate());

    const result: any = await service.confirmBooking(BOOKING_ID);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        referenceType: 'hotel_booking',
        referenceId: BOOKING_ID,
        message: expect.stringContaining(result.bookingReference),
      }),
    );
    const message = notifications.create.mock.calls[0][0].message as string;
    expect(message).toContain('Test Hotel');
    expect(message).toContain('100');
  });

  it('does not notify again on an idempotent re-confirm', async () => {
    const { service, notifications } = buildConfirmService(
      bookingTemplate({
        status: BookingStatus.Confirmed,
        bookingReference: 'ABC123',
      }),
    );

    await service.confirmBooking(BOOKING_ID);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('confirms successfully even when the notification throws', async () => {
    const notifications = {
      create: vi.fn().mockRejectedValue(new Error('notify down')),
    };
    const { service } = buildConfirmService(bookingTemplate(), {
      notifications,
    });

    const result: any = await service.confirmBooking(BOOKING_ID);

    expect(result.status).toBe(BookingStatus.Confirmed);
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });
});

// ==========================================
// completeDeparted (HTL-23)
// ==========================================

describe('HotelBookingsService.completeDeparted', () => {
  it('moves Confirmed bookings whose check-out has passed to Completed, in one updateMany', async () => {
    const bookingModel = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
    };
    const service = new HotelBookingsService(
      bookingModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      fakeNotifications() as any,
    );

    await service.completeDeparted();

    expect(bookingModel.updateMany).toHaveBeenCalledTimes(1);
    expect(bookingModel.updateMany).toHaveBeenCalledWith(
      {
        status: BookingStatus.Confirmed,
        checkOut: { $lt: expect.any(Date) },
      },
      { $set: { status: BookingStatus.Completed } },
    );
  });
});

// ==========================================
// cancel - Completed bookings stay ineligible (HTL-23 regression)
// ==========================================

describe('HotelBookingsService.cancel - Completed status regression', () => {
  it('still refuses to cancel a Completed booking', async () => {
    const booking: any = {
      _id: BOOKING_ID,
      userId: USER_ID,
      status: BookingStatus.Completed,
      checkIn: new Date('2020-01-02T00:00:00.000Z'),
      save: vi.fn(),
    };

    const bookingModel = {
      findOne: vi.fn().mockReturnValue(withSession(booking)),
    };
    const mongoSession = {
      withTransaction: (fn: () => unknown) => fn(),
      endSession: vi.fn(),
    };
    const connection = {
      startSession: vi.fn().mockResolvedValue(mongoSession),
    };

    const service = new HotelBookingsService(
      bookingModel as any,
      {} as any,
      {} as any,
      {} as any,
      connection as any,
      fakeNotifications() as any,
    );

    await expect(service.cancel(USER_ID, BOOKING_ID)).rejects.toThrow(
      'This booking cannot be cancelled',
    );
    expect(booking.save).not.toHaveBeenCalled();
  });
});
