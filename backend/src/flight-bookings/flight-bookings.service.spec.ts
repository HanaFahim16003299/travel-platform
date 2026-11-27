// Tests for FlightBookingsService (FLT-19 to FLT-26, ACC-11). Added by Joumana Hozayen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { FlightBookingsService } from './flight-bookings.service.js';
import {
  FlightBookingStatus,
  PassengerType,
  RefundStatus,
} from './flight-booking.enums.js';

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
    updateOne: vi.fn().mockResolvedValue({}),
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
  const flightCancellations = { register: vi.fn() } as Record<string, Mock>;
  // Payments module (merged): no Stripe payment found by default.
  const refundsService = {
    processRefundForBooking: vi.fn().mockResolvedValue(null),
  } as Record<string, Mock>;
  const gatewayRegistry = { register: vi.fn() } as Record<string, Mock>;
  const service = new FlightBookingsService(
    bookingModel as never,
    flightModel as never,
    airlineModel as never,
    seatHolds as never,
    notifications as never,
    flightCancellations as never,
    refundsService as never,
    gatewayRegistry as never,
  );
  return {
    flightCancellations,
    refundsService,
    gatewayRegistry,
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

/** The flight object most recently stubbed, so a test can change it afterwards. */
let lastStubbedFlight: { cabins: { price: number }[] };

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
  lastStubbedFlight = flight;
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

/** A real draft made by createDraft against the stubbed flight, so hold() sees no price change. */
async function makeDraft(
  h: ReturnType<typeof makeHarness>,
  airline: Record<string, unknown> = {},
  passengerOver: Record<string, unknown> = {},
) {
  const ids = stubFlight(h, airline);
  h.bookingModel.create.mockImplementation((doc) =>
    Promise.resolve({ _id: new Types.ObjectId(), ...doc }),
  );
  const draft = await h.service.createDraft(owner, {
    outbound: ids,
    passengers: [adultDto(passengerOver)],
  } as never);
  h.bookingModel.countDocuments.mockResolvedValue(0);
  return draft as unknown as ReturnType<typeof bookingDoc>;
}

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

  describe('flight cancelled by the airline (FLT-06, review A3)', () => {
    it('registers itself for flight cancellations', () => {
      h.service.onModuleInit();
      expect(h.flightCancellations.register).toHaveBeenCalledTimes(1);
    });

    it('expires holds, cancels confirmed bookings with a full refund amount and notifies everyone', async () => {
      const held = bookingDoc({ status: FlightBookingStatus.PENDING_PAYMENT });
      const confirmed = bookingDoc({
        status: FlightBookingStatus.CONFIRMED,
        totalPrice: 650,
      });
      h.bookingModel.find.mockResolvedValue([held, confirmed]);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...confirmed,
        status: FlightBookingStatus.CANCELLED,
      });

      h.service.onModuleInit();
      const listener = h.flightCancellations.register.mock.calls[0][0];
      await listener.onFlightCancelled(String(confirmed.segments[0].flightId));

      expect(h.seatHolds.expireOne).toHaveBeenCalledWith(held._id, true);
      expect(h.seatHolds.cancelConfirmed).toHaveBeenCalledWith(
        confirmed,
        expect.objectContaining({ refundAmount: 650 }),
      );
      expect(h.notifications.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('hold policy acceptance (PAY-02, review B2)', () => {
    it('refuses to hold seats when the policies are not accepted', async () => {
      await expect(
        h.service.hold(owner, new Types.ObjectId().toString(), false),
      ).rejects.toThrow(
        'You must accept the airline baggage and cancellation policies',
      );
      expect(h.bookingModel.findOne).not.toHaveBeenCalled();
      expect(h.seatHolds.holdDraft).not.toHaveBeenCalled();
    });

    it('stores the acceptance time when holding', async () => {
      const draft = await makeDraft(h);
      h.bookingModel.findOne.mockResolvedValue(draft);
      h.seatHolds.holdDraft.mockResolvedValue({
        status: FlightBookingStatus.PENDING_PAYMENT,
      });

      await h.service.hold(owner, draft._id.toString(), true);

      const acceptedAt = h.seatHolds.holdDraft.mock.calls[0][2];
      expect(acceptedAt).toBeInstanceOf(Date);
    });
  });

  describe('refund tracking (PAY-03, review B3)', () => {
    it('marks the refund PENDING and does not promise a refunded amount yet', async () => {
      const b = bookingDoc();
      h.bookingModel.findById.mockResolvedValue(b);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...b,
        status: FlightBookingStatus.CANCELLED,
      });

      const result = await h.service.cancel(owner, b._id.toString());

      expect(h.seatHolds.cancelConfirmed).toHaveBeenCalledWith(b, {
        refundAmount: 400,
        refundStatus: RefundStatus.PENDING,
      });
      const message: string = h.notifications.create.mock.calls[0][0].message;
      expect(message).toContain('is pending');
      expect(message).not.toContain('Refund:');
      expect(result.refundAmount).toBe(400);
    });

    it('sets no refund status when nothing is refunded', async () => {
      const b = bookingDoc();
      b.segments[0].refundable = false;
      h.bookingModel.findById.mockResolvedValue(b);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...b,
        status: FlightBookingStatus.CANCELLED,
      });

      await h.service.cancel(owner, b._id.toString());

      expect(h.seatHolds.cancelConfirmed).toHaveBeenCalledWith(b, {
        refundAmount: 0,
      });
      expect(h.notifications.create.mock.calls[0][0].message).toContain(
        'No refund applies',
      );
    });

    it('asks the payments module for the Stripe refund and stores REFUNDED', async () => {
      const b = bookingDoc();
      const cancelled = { ...b, status: FlightBookingStatus.CANCELLED };
      h.bookingModel.findById.mockResolvedValue(b);
      h.seatHolds.cancelConfirmed.mockResolvedValue(cancelled);
      h.refundsService.processRefundForBooking.mockResolvedValue({
        _id: 'refund-1',
        status: 'Succeeded',
      });

      const result = await h.service.cancel(owner, b._id.toString());

      expect(h.refundsService.processRefundForBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingType: 'flight',
          amount: 400,
          currency: 'USD',
        }),
      );
      expect(h.bookingModel.updateOne).toHaveBeenCalledWith(
        { _id: b._id },
        { $set: { refundId: 'refund-1', refundStatus: RefundStatus.REFUNDED } },
      );
      expect(result.booking).toMatchObject({
        refundStatus: RefundStatus.REFUNDED,
      });
    });

    it('stores FAILED when Stripe refuses the refund', async () => {
      const b = bookingDoc();
      h.bookingModel.findById.mockResolvedValue(b);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...b,
        status: FlightBookingStatus.CANCELLED,
      });
      h.refundsService.processRefundForBooking.mockResolvedValue({
        _id: 'refund-2',
        status: 'Failed',
      });

      await h.service.cancel(owner, b._id.toString());

      expect(h.bookingModel.updateOne).toHaveBeenCalledWith(
        { _id: b._id },
        { $set: { refundId: 'refund-2', refundStatus: RefundStatus.FAILED } },
      );
    });

    it('keeps the cancellation and the PENDING status when the refund cannot be created', async () => {
      const b = bookingDoc();
      h.bookingModel.findById.mockResolvedValue(b);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...b,
        status: FlightBookingStatus.CANCELLED,
        refundStatus: RefundStatus.PENDING,
      });
      h.refundsService.processRefundForBooking.mockRejectedValue(
        new Error('stripe down'),
      );

      const result = await h.service.cancel(owner, b._id.toString());

      expect(result.booking).toMatchObject({
        refundStatus: RefundStatus.PENDING,
      });
      expect(h.bookingModel.updateOne).not.toHaveBeenCalled();
    });

    it('marks refunds of an airline-cancelled flight PENDING', async () => {
      const confirmed = bookingDoc();
      h.bookingModel.find.mockResolvedValue([confirmed]);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...confirmed,
        status: FlightBookingStatus.CANCELLED,
      });

      await h.service.cancelAllForFlight(
        String(confirmed.segments[0].flightId),
      );

      expect(h.seatHolds.cancelConfirmed).toHaveBeenCalledWith(confirmed, {
        refundAmount: 400,
        refundStatus: RefundStatus.PENDING,
      });
      expect(h.notifications.create.mock.calls[0][0].message).toContain(
        'is pending',
      );
    });
  });

  describe('booking details and access (ACC-11, review C3)', () => {
    const admin = {
      id: new Types.ObjectId().toString(),
      email: 'a@test.com',
      role: 'admin',
    } as never;
    const moderatorOf = (airlineId: Types.ObjectId) =>
      ({
        id: new Types.ObjectId().toString(),
        email: 'm@test.com',
        role: 'airline_moderator',
        assignedProvider: { type: 'airline', providerId: String(airlineId) },
      }) as never;
    const withPersonalData = () => {
      const b = bookingDoc();
      Object.assign(b.passengers[0], {
        documentNumber: 'PASSPORT-X9',
        email: 'sara@test.com',
        phone: '+20-PHONE',
        ticketNumber: 'ABC234-01',
      });
      Object.assign(b.segments[0], {
        flightNumber: 'TA100',
        cabinClass: 'economy',
        arrivalAt: new Date(),
      });
      return b;
    };

    it('gives the owner the full booking', async () => {
      const b = withPersonalData();
      h.bookingModel.findById.mockResolvedValue(b);
      expect(await h.service.viewFor(owner, b._id.toString())).toBe(b);
    });

    it('gives an admin a reduced view without passport, birth date, email or phone', async () => {
      const b = withPersonalData();
      h.bookingModel.findById.mockResolvedValue(b);

      const view = await h.service.viewFor(admin, b._id.toString());

      expect(view).toMatchObject({
        bookingReference: 'ABC234',
        status: FlightBookingStatus.CONFIRMED,
      });
      expect((view as { passengers: unknown[] }).passengers).toEqual([
        {
          firstName: 'Sara',
          lastName: 'Ali',
          type: PassengerType.ADULT,
          ticketNumber: 'ABC234-01',
        },
      ]);
      const json = JSON.stringify(view);
      for (const secret of [
        'PASSPORT-X9',
        'sara@test.com',
        '+20-PHONE',
        '1990-01-01',
      ])
        expect(json).not.toContain(secret);
    });

    it("lets the booked airline's moderator see the reduced view", async () => {
      const b = withPersonalData();
      h.bookingModel.findById.mockResolvedValue(b);
      const view = await h.service.viewFor(
        moderatorOf(b.segments[0].airlineId),
        b._id.toString(),
      );
      expect(JSON.stringify(view)).not.toContain('sara@test.com');
    });

    it("refuses another airline's moderator and other users", async () => {
      const b = withPersonalData();
      h.bookingModel.findById.mockResolvedValue(b);
      await expect(
        h.service.findOneFor(
          moderatorOf(new Types.ObjectId()),
          b._id.toString(),
        ),
      ).rejects.toThrow('You do not have access to this booking');
      const stranger = {
        id: new Types.ObjectId().toString(),
        email: 's@test.com',
        role: 'user',
      } as never;
      await expect(
        h.service.findOneFor(stranger, b._id.toString()),
      ).rejects.toThrow('You do not have access to this booking');
    });

    it("hides other users' drafts, even from an admin", async () => {
      h.bookingModel.findById.mockResolvedValue(
        bookingDoc({ status: FlightBookingStatus.DRAFT }),
      );
      await expect(
        h.service.findOneFor(admin, new Types.ObjectId().toString()),
      ).rejects.toThrow('Booking not found');
    });

    it('answers 404 for an invalid id', async () => {
      await expect(h.service.findOneFor(owner, 'abc')).rejects.toThrow(
        'Booking not found',
      );
      expect(h.bookingModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('seat hoarding and stale prices (review C4)', () => {
    it('refuses a sixth unfinished draft with 429', async () => {
      const ids = stubFlight(h);
      h.bookingModel.countDocuments.mockResolvedValue(5);

      await expect(
        h.service.createDraft(owner, {
          outbound: ids,
          passengers: [adultDto()],
        } as never),
      ).rejects.toMatchObject({ status: 429 });
      expect(h.bookingModel.create).not.toHaveBeenCalled();
    });

    it('refuses a third active hold with 429', async () => {
      const draft = await makeDraft(h);
      h.bookingModel.findOne.mockResolvedValue(draft);
      h.bookingModel.countDocuments.mockResolvedValue(2);

      await expect(
        h.service.hold(owner, String(draft._id), true),
      ).rejects.toMatchObject({ status: 429 });
      expect(h.seatHolds.holdDraft).not.toHaveBeenCalled();
    });

    it('holds when the price and policies are unchanged', async () => {
      const draft = await makeDraft(h, {
        baggagePolicy: { extraBagPrice: 30, maxExtraBags: 1 },
      });
      h.bookingModel.findOne.mockResolvedValue(draft);
      h.seatHolds.holdDraft.mockResolvedValue({
        status: FlightBookingStatus.PENDING_PAYMENT,
      });

      await h.service.hold(owner, String(draft._id), true);

      expect(h.seatHolds.holdDraft).toHaveBeenCalled();
      expect(h.bookingModel.updateOne).not.toHaveBeenCalled();
    });

    it('updates the draft and refuses the hold when the price changed', async () => {
      const draft = await makeDraft(h);
      h.bookingModel.findOne.mockResolvedValue(draft);
      // The airline raised the cabin price from 200 to 260 after the summary.
      lastStubbedFlight.cabins[0].price = 260;

      await expect(
        h.service.hold(owner, String(draft._id), true),
      ).rejects.toThrow('The price or airline policies changed');
      expect(h.seatHolds.holdDraft).not.toHaveBeenCalled();
      expect(h.bookingModel.updateOne).toHaveBeenCalledWith(
        { _id: draft._id, status: FlightBookingStatus.DRAFT },
        { $set: expect.objectContaining({ totalPrice: 260 }) },
      );
    });
  });

  describe('cancel and cancellation quote (FLT-26, review A7)', () => {
    it('quotes the same refund that cancel records', async () => {
      const b = bookingDoc();
      b.segments[0].cancellationTiers = [
        { daysBefore: 7, refundPercent: 50 },
      ] as never;
      h.bookingModel.findById.mockResolvedValue(b);
      h.seatHolds.cancelConfirmed.mockResolvedValue({
        ...b,
        status: FlightBookingStatus.CANCELLED,
      });

      const quote = await h.service.cancellationQuote(owner, b._id.toString());
      const result = await h.service.cancel(owner, b._id.toString());

      expect(quote.refundAmount).toBe(200);
      expect(result.refundAmount).toBe(quote.refundAmount);
    });

    it("refuses to cancel someone else's booking", async () => {
      h.bookingModel.findById.mockResolvedValue(
        bookingDoc({ userId: new Types.ObjectId() }),
      );
      await expect(
        h.service.cancel(owner, new Types.ObjectId().toString()),
      ).rejects.toThrow('You do not have access to this booking');
    });

    it('only cancels confirmed bookings', async () => {
      h.bookingModel.findById.mockResolvedValue(
        bookingDoc({ status: FlightBookingStatus.PENDING_PAYMENT }),
      );
      await expect(
        h.service.cancel(owner, new Types.ObjectId().toString()),
      ).rejects.toThrow('Only confirmed bookings can be cancelled');
    });

    it('refuses to cancel after departure', async () => {
      const b = bookingDoc();
      b.segments[0].departureAt = new Date(Date.now() - 60_000);
      h.bookingModel.findById.mockResolvedValue(b);
      await expect(h.service.cancel(owner, b._id.toString())).rejects.toThrow(
        'Bookings cannot be cancelled after departure',
      );
      expect(h.seatHolds.cancelConfirmed).not.toHaveBeenCalled();
    });

    it('reports a booking that stopped being confirmed during the cancel', async () => {
      h.bookingModel.findById.mockResolvedValue(bookingDoc());
      h.seatHolds.cancelConfirmed.mockResolvedValue(null);
      await expect(
        h.service.cancel(owner, new Types.ObjectId().toString()),
      ).rejects.toThrow('Booking is no longer confirmed');
      expect(h.notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('payments gateway (PAY-01, PAY-02)', () => {
    it('registers the flight booking gateway with the payments module', async () => {
      const b = bookingDoc({
        status: FlightBookingStatus.CONFIRMED,
        paymentId: 'pi_1',
      });
      h.bookingModel.findById.mockResolvedValue(b);

      h.service.onModuleInit();

      const [type, gateway] = h.gatewayRegistry.register.mock.calls[0];
      expect(type).toBe('flight');
      // confirmAfterPayment is reported as a boolean: true = keep the payment.
      expect(await gateway.confirmAfterPayment(b._id.toString(), 'pi_1')).toBe(
        true,
      );
      expect(
        await gateway.confirmAfterPayment(b._id.toString(), 'pi_other'),
      ).toBe(false);
    });

    it('expireIfDue expires through the seat-hold service', async () => {
      const id = new Types.ObjectId();
      await h.service.expireIfDue(id.toString());
      expect(h.seatHolds.expireOne).toHaveBeenCalledWith(id, false);
    });
  });
});
