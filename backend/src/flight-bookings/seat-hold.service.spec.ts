// Tests for seat holds, expiry and seat release (FLT-22, review A5). Added by Joumana Hozayen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SeatHoldService, seatReleasesFor } from './seat-hold.service.js';
import { FlightBookingStatus } from './flight-booking.enums.js';

type Mock = ReturnType<typeof vi.fn>;
type Pending = {
  _id: Types.ObjectId;
  flightId: Types.ObjectId;
  cabinId: Types.ObjectId;
  count: number;
};
const ACCEPTED = new Date('2027-01-01T00:00:00Z');
const leg = () => ({
  flightId: new Types.ObjectId(),
  cabinId: new Types.ObjectId(),
});
const chain = (value: unknown) => ({
  select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }),
});

describe('SeatHoldService', () => {
  let bookingModel: Record<string, Mock>;
  let flightModel: { updateOne: Mock };
  let flightsService: { reserveSeats: Mock };
  let service: SeatHoldService;
  /** Simulated pendingSeatReleases list of the booking under test. */
  let pending: Pending[];
  let extra: Record<string, unknown>;

  const pushAll = (items: Omit<Pending, '_id'>[]) => {
    for (const i of items) pending.push({ _id: new Types.ObjectId(), ...i });
  };

  beforeEach(() => {
    pending = [];
    extra = {};
    bookingModel = {
      findOneAndUpdate: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      updateOne: vi.fn(),
    };
    // $push on pendingSeatReleases behaves like MongoDB on the simulated list.
    bookingModel.updateOne.mockImplementation((_filter, update) => {
      const push = update.$push?.pendingSeatReleases;
      if (push) pushAll(push.$each ?? [push]);
      return Promise.resolve({});
    });
    bookingModel.findById.mockImplementation(() =>
      chain({ ...extra, pendingSeatReleases: [...pending] }),
    );
    flightModel = { updateOne: vi.fn().mockResolvedValue({}) };
    flightsService = { reserveSeats: vi.fn().mockResolvedValue({}) };
    service = new SeatHoldService(
      bookingModel as never,
      flightModel as never,
      flightsService as never,
    );
  });

  /** findOneAndUpdate: claims ($pull) act on the simulated list; other calls return `flip`. */
  function stubUpdates(flip: (update: Record<string, never>) => unknown) {
    bookingModel.findOneAndUpdate.mockImplementation((_filter, update) => {
      const pull = update.$pull?.pendingSeatReleases;
      if (pull) {
        const i = pending.findIndex((p) => p._id.equals(pull._id));
        if (i < 0) return Promise.resolve(null);
        pending.splice(i, 1);
        return Promise.resolve({});
      }
      return Promise.resolve().then(() => flip(update));
    });
  }

  describe('holdDraft', () => {
    it('reserves every leg and flips the draft to PENDING_PAYMENT', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 2,
        segments: [leg(), leg()],
      };
      stubUpdates(() => ({ status: FlightBookingStatus.PENDING_PAYMENT }));

      await service.holdDraft(draft as never, 10, ACCEPTED);

      expect(flightsService.reserveSeats).toHaveBeenCalledTimes(2);
      expect(bookingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: draft._id, status: FlightBookingStatus.DRAFT },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: FlightBookingStatus.PENDING_PAYMENT,
            policyAcceptedAt: ACCEPTED,
          }),
        }),
        { new: true },
      );
      expect(flightModel.updateOne).not.toHaveBeenCalled();
    });

    it('gives the first leg back when the second leg has no seats', async () => {
      const first = leg();
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 1,
        segments: [first, leg()],
      };
      stubUpdates(() => null);
      flightsService.reserveSeats
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(
          new ConflictException('Not enough seats are available'),
        );

      await expect(
        service.holdDraft(draft as never, 10, ACCEPTED),
      ).rejects.toThrow('Not enough seats are available');

      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
      expect(flightModel.updateOne).toHaveBeenCalledWith(
        { _id: first.flightId, 'cabins._id': first.cabinId },
        { $inc: { 'cabins.$.availableSeats': 1 } },
      );
      expect(pending).toHaveLength(0);
    });

    it('releases the seats of the losing request on a double click', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 1,
        segments: [leg()],
      };
      stubUpdates(() => null); // the other click already flipped the draft

      await expect(
        service.holdDraft(draft as never, 10, ACCEPTED),
      ).rejects.toThrow('already on hold');
      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
    });

    it('releases the reserved seats when the status update throws', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 2,
        segments: [leg(), leg()],
      };
      stubUpdates(() => {
        throw new Error('db down');
      });

      await expect(
        service.holdDraft(draft as never, 10, ACCEPTED),
      ).rejects.toThrow('db down');
      expect(flightModel.updateOne).toHaveBeenCalledTimes(2);
      expect(pending).toHaveLength(0);
    });
  });

  describe('seat releases (review A5)', () => {
    it('keeps a failing release queued and the scheduler releases it later', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 1,
        segments: [leg()],
      };
      stubUpdates(() => null);
      flightModel.updateOne.mockRejectedValue(new Error('flights down'));

      await expect(
        service.holdDraft(draft as never, 10, ACCEPTED),
      ).rejects.toThrow('already on hold');
      expect(flightModel.updateOne).toHaveBeenCalledTimes(3); // retried
      expect(pending).toHaveLength(1); // re-queued, not lost

      flightModel.updateOne.mockResolvedValue({});
      bookingModel.find.mockReturnValue(chain([{ _id: draft._id }]));
      await service.retryPendingReleases();

      expect(flightModel.updateOne).toHaveBeenCalledTimes(4);
      expect(pending).toHaveLength(0);
    });

    it('does not release seats another caller already claimed', async () => {
      pushAll([{ ...leg(), count: 1 }]);
      bookingModel.findOneAndUpdate.mockResolvedValue(null); // claim lost

      await service.processPendingReleases(new Types.ObjectId());

      expect(flightModel.updateOne).not.toHaveBeenCalled();
    });

    it('releases directly when the release cannot even be recorded', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 1,
        segments: [leg()],
      };
      stubUpdates(() => null);
      bookingModel.updateOne.mockRejectedValue(new Error('db down'));

      await expect(
        service.holdDraft(draft as never, 10, ACCEPTED),
      ).rejects.toThrow('already on hold');
      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
    });

    it('cancelConfirmed queues the seats in the status update and releases them', async () => {
      const booking = {
        _id: new Types.ObjectId(),
        seatCount: 2,
        segments: [leg()],
      };
      stubUpdates((update) => {
        pushAll(
          (update.$push as { pendingSeatReleases: { $each: never[] } })
            .pendingSeatReleases.$each,
        );
        return { status: FlightBookingStatus.CANCELLED };
      });

      const result = await service.cancelConfirmed(booking as never, {
        refundAmount: 10,
      });

      expect(result).toEqual({ status: FlightBookingStatus.CANCELLED });
      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
      expect(pending).toHaveLength(0);
    });
  });

  describe('expireOne', () => {
    it('releases seats once even when two callers expire the same booking', async () => {
      const segments = [leg()];
      extra = { segments, seatCount: 2 };
      let flipped = false;
      stubUpdates((update) => {
        if (flipped) return null; // the second caller loses the status flip
        flipped = true;
        pushAll(
          (update.$push as { pendingSeatReleases: { $each: never[] } })
            .pendingSeatReleases.$each,
        );
        return { status: FlightBookingStatus.EXPIRED };
      });
      const id = new Types.ObjectId();

      await service.expireOne(id);
      await service.expireOne(id);

      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
      expect(flightModel.updateOne).toHaveBeenCalledWith(
        { _id: segments[0].flightId, 'cabins._id': segments[0].cabinId },
        { $inc: { 'cabins.$.availableSeats': 2 } },
      );
    });
  });

  it('seatReleasesFor builds one release per leg', () => {
    const legs = [leg(), leg()];
    expect(seatReleasesFor(legs, 3)).toEqual(
      legs.map((l) => ({ ...l, count: 3 })),
    );
  });
});
