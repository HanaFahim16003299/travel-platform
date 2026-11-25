import { describe, it, expect, vi, afterEach } from 'vitest';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { HOTEL_HOLD_MINUTES } from './constants.js';

const USER_ID = 'a'.repeat(24);
const HOTEL_ID = 'b'.repeat(24);
const ROOM_ID = 'c'.repeat(24);

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
