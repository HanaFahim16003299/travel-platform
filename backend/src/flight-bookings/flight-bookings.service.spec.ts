// Tests for FlightBookingsService (FLT-19 to FLT-26, ACC-11). Added by Joumana Hozayen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { FlightBookingsService } from './flight-bookings.service.js';
import { FlightBookingStatus, PassengerType } from './flight-booking.enums.js';

type Mock = ReturnType<typeof vi.fn>;

const USER_ID = new Types.ObjectId().toString();

function makeHarness() {
  const bookingModel = {
    findById: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn().mockResolvedValue(0),
    exists: vi.fn(),
    updateMany: vi.fn(),
  } as Record<string, Mock>;
  const flightModel = { findById: vi.fn() } as Record<string, Mock>;
  const airlineModel = { findById: vi.fn() } as Record<string, Mock>;
  const seatHolds = {
    holdDraft: vi.fn(),
    releaseSegments: vi.fn().mockResolvedValue(undefined),
    expireOne: vi.fn().mockResolvedValue(undefined),
    expireStaleHolds: vi.fn(),
  } as Record<string, Mock>;
  const notifications = { create: vi.fn().mockResolvedValue({}) } as Record<
    string,
    Mock
  >;
  const service = new FlightBookingsService(
    bookingModel as never,
    flightModel as never,
    airlineModel as never,
    seatHolds as never,
    notifications as never,
  );
  return {
    service,
    bookingModel,
    flightModel,
    airlineModel,
    seatHolds,
    notifications,
  };
}

/** A minimal booking document with the fields the service reads. */
function bookingDoc(over: Record<string, unknown> = {}) {
  const departureAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  return {
    _id: new Types.ObjectId(),
    id: new Types.ObjectId().toString(),
    userId: new Types.ObjectId(USER_ID),
    status: FlightBookingStatus.CONFIRMED,
    seatCount: 1,
    totalPrice: 400,
    currency: 'USD',
    bookingReference: 'ABC234',
    holdExpiresAt: new Date(Date.now() + 5 * 60_000),
    passengers: [
      {
        firstName: 'Sara',
        lastName: 'Ali',
        dateOfBirth: new Date('1990-01-01'),
        documentNumber: 'A1',
        type: PassengerType.ADULT,
        extraBags: 0,
      },
    ],
    segments: [
      {
        flightId: new Types.ObjectId(),
        cabinId: new Types.ObjectId(),
        airlineId: new Types.ObjectId(),
        departureAt,
        cancellationTiers: [],
        refundable: true,
        refundPercentage: 100,
        cancellationFee: 0,
        cancellationDeadlineHours: 0,
      },
    ],
    ...over,
  };
}

const owner = { id: USER_ID, email: 'u@test.com', role: 'user' } as never;

describe('FlightBookingsService', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => {
    h = makeHarness();
  });

  describe('confirmAfterPayment (FLT-23)', () => {
    it('keeps every stored passenger field and adds a ticket number', async () => {
      const b = bookingDoc({ status: FlightBookingStatus.PENDING_PAYMENT });
      (b.passengers[0] as Record<string, unknown>).futureField = 'kept';
      h.bookingModel.findById.mockResolvedValue(b);
      h.bookingModel.findOneAndUpdate.mockImplementation((_f, update) =>
        Promise.resolve({
          ...b,
          ...update.$set,
          status: FlightBookingStatus.CONFIRMED,
        }),
      );

      const confirmed = await h.service.confirmAfterPayment(
        b._id.toString(),
        'pi_1',
      );

      const set = h.bookingModel.findOneAndUpdate.mock.calls[0][1].$set;
      expect(set.passengers[0]).toMatchObject({
        futureField: 'kept',
        documentNumber: 'A1',
      });
      expect(set.passengers[0].ticketNumber).toBe(`${set.bookingReference}-01`);
      expect(confirmed?.status).toBe(FlightBookingStatus.CONFIRMED);
    });

    it('retries with a new reference when the reference already exists', async () => {
      const b = bookingDoc({ status: FlightBookingStatus.PENDING_PAYMENT });
      h.bookingModel.findById.mockResolvedValue(b);
      h.bookingModel.findOneAndUpdate
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
        .mockResolvedValueOnce({ ...b, status: FlightBookingStatus.CONFIRMED });

      await h.service.confirmAfterPayment(b._id.toString(), 'pi_1');

      expect(h.bookingModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
