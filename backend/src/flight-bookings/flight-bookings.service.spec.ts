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
    cancelConfirmed: vi.fn(),
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

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });

/** Stubs one bookable flight + airline; returns the ids to put in the request. */
function stubFlight(
  h: ReturnType<typeof makeHarness>,
  airline: Record<string, unknown> = {},
  flightOver: Record<string, unknown> = {},
) {
  const flightId = new Types.ObjectId();
  const cabinId = new Types.ObjectId();
  const airlineId = new Types.ObjectId();
  const departureTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const flight = {
    _id: flightId,
    airlineId,
    flightNumber: 'TA100',
    status: 'scheduled',
    departureAirportId: new Types.ObjectId(),
    arrivalAirportId: new Types.ObjectId(),
    departureTime,
    arrivalTime: new Date(departureTime.getTime() + 4 * 60 * 60 * 1000),
    cabins: [
      {
        _id: cabinId,
        cabinClass: 'economy',
        price: 200,
        currency: 'USD',
        availableSeats: 5,
      },
    ],
    ...flightOver,
  };
  h.flightModel.findById.mockReturnValue(lean(flight));
  h.airlineModel.findById.mockReturnValue(
    lean({ _id: airlineId, isActive: true, ...airline }),
  );
  return { flightId: String(flightId), cabinId: String(cabinId), flight };
}

const adultDto = (over: Record<string, unknown> = {}) => ({
  firstName: 'Sara',
  lastName: 'Ali',
  dateOfBirth: '1990-01-01',
  documentNumber: 'A1',
  type: PassengerType.ADULT,
  email: 'sara@test.com',
  phone: '0100',
  ...over,
});

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

  describe('createDraft with airline policies (FLT-08, FLT-09)', () => {
    it('uses the airline extra-bag price, bag limit and tiers', async () => {
      const tiers = [{ daysBefore: 7, refundPercent: 50 }];
      const ids = stubFlight(h, {
        baggagePolicy: {
          checkedBags: 1,
          checkedBagWeightKg: 23,
          extraBagPrice: 40,
          maxExtraBags: 2,
        },
        cancellationPolicy: { tiers },
      });
      h.bookingModel.create.mockImplementation((doc) => Promise.resolve(doc));

      const draft = await h.service.createDraft(owner, {
        outbound: ids,
        passengers: [adultDto({ extraBags: 2 })],
      } as never);

      expect(draft).toMatchObject({
        baseFare: 200,
        baggageFees: 80,
        totalPrice: 280,
      });
      expect(
        (draft as { segments: { cancellationTiers: unknown }[] }).segments[0]
          .cancellationTiers,
      ).toEqual(tiers);
    });

    it('rejects more extra bags than the airline allows', async () => {
      const ids = stubFlight(h, {
        baggagePolicy: { extraBagPrice: 40, maxExtraBags: 1 },
      });

      await expect(
        h.service.createDraft(owner, {
          outbound: ids,
          passengers: [adultDto({ extraBags: 2 })],
        } as never),
      ).rejects.toThrow('Maximum 1 extra bag(s)');
      expect(h.bookingModel.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmAfterPayment idempotency (PAY-01, review A2)', () => {
    it('returns the booking unchanged when the same payment is delivered twice', async () => {
      const b = bookingDoc({
        status: FlightBookingStatus.CONFIRMED,
        paymentId: 'pi_1',
      });
      h.bookingModel.findById.mockResolvedValue(b);

      const result = await h.service.confirmAfterPayment(
        b._id.toString(),
        'pi_1',
      );

      expect(result).toBe(b);
      expect(h.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(h.notifications.create).not.toHaveBeenCalled();
    });

    it('returns null for a confirmed booking paid by a different payment', async () => {
      h.bookingModel.findById.mockResolvedValue(
        bookingDoc({
          status: FlightBookingStatus.CONFIRMED,
          paymentId: 'pi_other',
        }),
      );
      expect(
        await h.service.confirmAfterPayment(
          new Types.ObjectId().toString(),
          'pi_1',
        ),
      ).toBeNull();
    });

    it('returns null when the hold expired', async () => {
      h.bookingModel.findById.mockResolvedValue(
        bookingDoc({ status: FlightBookingStatus.EXPIRED }),
      );
      expect(
        await h.service.confirmAfterPayment(
          new Types.ObjectId().toString(),
          'pi_1',
        ),
      ).toBeNull();
    });

    it('returns the booking when a parallel delivery of the same payment won the race', async () => {
      const pending = bookingDoc({
        status: FlightBookingStatus.PENDING_PAYMENT,
      });
      const confirmed = {
        ...pending,
        status: FlightBookingStatus.CONFIRMED,
        paymentId: 'pi_1',
      };
      h.bookingModel.findById
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(confirmed);
      h.bookingModel.findOneAndUpdate.mockResolvedValue(null);

      expect(
        await h.service.confirmAfterPayment(pending._id.toString(), 'pi_1'),
      ).toBe(confirmed);
      expect(h.notifications.create).not.toHaveBeenCalled();
    });
  });
});
