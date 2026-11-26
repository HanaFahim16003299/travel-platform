// Tests for seat holds and expiry (FLT-22). Added by Joumana Hozayen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SeatHoldService } from './seat-hold.service.js';
import { FlightBookingStatus } from './flight-booking.enums.js';

const leg = () => ({
  flightId: new Types.ObjectId(),
  cabinId: new Types.ObjectId(),
});

describe('SeatHoldService', () => {
  let bookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightModel: { updateOne: ReturnType<typeof vi.fn> };
  let flightsService: { reserveSeats: ReturnType<typeof vi.fn> };
  let service: SeatHoldService;

  beforeEach(() => {
    bookingModel = { findOneAndUpdate: vi.fn(), find: vi.fn() };
    flightModel = { updateOne: vi.fn().mockResolvedValue({}) };
    flightsService = { reserveSeats: vi.fn().mockResolvedValue({}) };
    service = new SeatHoldService(
      bookingModel as never,
      flightModel as never,
      flightsService as never,
    );
  });

  describe('holdDraft', () => {
    it('reserves every leg and flips the draft to PENDING_PAYMENT', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 2,
        segments: [leg(), leg()],
      };
      bookingModel.findOneAndUpdate.mockResolvedValue({
        status: FlightBookingStatus.PENDING_PAYMENT,
      });

      await service.holdDraft(draft as never, 10);

      expect(flightsService.reserveSeats).toHaveBeenCalledTimes(2);
      expect(bookingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: draft._id, status: FlightBookingStatus.DRAFT },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: FlightBookingStatus.PENDING_PAYMENT,
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
      flightsService.reserveSeats
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(
          new ConflictException('Not enough seats are available'),
        );

      await expect(service.holdDraft(draft as never, 10)).rejects.toThrow(
        'Not enough seats are available',
      );

      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
      expect(flightModel.updateOne).toHaveBeenCalledWith(
        { _id: first.flightId, 'cabins._id': first.cabinId },
        { $inc: { 'cabins.$.availableSeats': 1 } },
      );
      expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('releases the seats of the losing request on a double click', async () => {
      const draft = {
        _id: new Types.ObjectId(),
        seatCount: 1,
        segments: [leg()],
      };
      bookingModel.findOneAndUpdate.mockResolvedValue(null); // the other click already flipped it

      await expect(service.holdDraft(draft as never, 10)).rejects.toThrow(
        'already on hold',
      );
      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('expireOne', () => {
    it('releases seats once when it wins the status flip', async () => {
      const b = { segments: [leg()], seatCount: 2 };
      bookingModel.findOneAndUpdate
        .mockResolvedValueOnce(b)
        .mockResolvedValueOnce(null);
      const id = new Types.ObjectId();

      await service.expireOne(id);
      await service.expireOne(id); // second caller (e.g. another cron tick) loses the flip

      expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
    });
  });
});
