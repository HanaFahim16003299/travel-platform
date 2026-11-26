// Seat holds, hold expiry and seat release for flight bookings (FLT-22).
// Split out of FlightBookingsService by Joumana Hozayen (review item D1).
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FlightsService } from '../flights/flights.service.js';
import { Flight } from '../flights/schemas/flight.schema.js';
import type { FlightDocument } from '../flights/schemas/flight.schema.js';
import { FlightBooking, Segment } from './schemas/flight-booking.schema.js';
import type { FlightBookingDocument } from './schemas/flight-booking.schema.js';
import { FlightBookingStatus } from './flight-booking.enums.js';

/** One cabin that has to get `count` seats back. */
export interface SeatRelease {
  flightId: Types.ObjectId;
  cabinId: Types.ObjectId;
  count: number;
}

/** The seat releases that undo a booking's seats on the given legs. */
export function seatReleasesFor(
  segments: Pick<Segment, 'flightId' | 'cabinId'>[],
  count: number,
): SeatRelease[] {
  return segments.map((s) => ({
    flightId: s.flightId,
    cabinId: s.cabinId,
    count,
  }));
}

const RELEASE_ATTEMPTS = 3;

@Injectable()
export class SeatHoldService {
  private readonly logger = new Logger(SeatHoldService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBookingDocument>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    private readonly flightsService: FlightsService,
  ) {}

  /**
   * Reserves the seats of a DRAFT booking and turns it into PENDING_PAYMENT.
   * reserveSeats is atomic (check + decrement in one MongoDB operation), so concurrent
   * requests can never overbook. Legs already reserved are given back if a later step
   * fails, including when the status update itself throws (review A5).
   */
  async holdDraft(draft: FlightBookingDocument, holdMinutes: number) {
    const reserved: Segment[] = [];
    try {
      for (const s of draft.segments) {
        await this.flightsService.reserveSeats(
          String(s.flightId),
          String(s.cabinId),
          draft.seatCount,
        );
        reserved.push(s);
      }
    } catch (err) {
      await this.giveBack(
        draft._id,
        seatReleasesFor(reserved, draft.seatCount),
      );
      throw err instanceof HttpException
        ? err
        : new ConflictException('Not enough seats are available');
    }

    // Flip DRAFT -> PENDING_PAYMENT atomically. If two requests race on the same draft
    // (double click), only one wins; the loser gives its seats back.
    let held: FlightBookingDocument | null;
    try {
      held = await this.bookingModel.findOneAndUpdate(
        { _id: draft._id, status: FlightBookingStatus.DRAFT },
        {
          $set: {
            status: FlightBookingStatus.PENDING_PAYMENT,
            holdExpiresAt: new Date(Date.now() + holdMinutes * 60_000),
          },
          $unset: { draftExpiresAt: 1 },
        },
        { new: true },
      );
    } catch (err) {
      await this.giveBack(
        draft._id,
        seatReleasesFor(reserved, draft.seatCount),
      );
      throw err;
    }
    if (!held) {
      await this.giveBack(
        draft._id,
        seatReleasesFor(reserved, draft.seatCount),
      );
      throw new ConflictException('This booking is already on hold');
    }
    return held;
  }

  /** Gives seats back to a cabin (the opposite of FlightsService.reserveSeats). */
  async releaseSeats(
    flightId: Types.ObjectId,
    cabinId: Types.ObjectId,
    count: number,
  ) {
    await this.flightModel.updateOne(
      { _id: flightId, 'cabins._id': cabinId },
      { $inc: { 'cabins.$.availableSeats': count } },
    );
  }

  /**
   * Gives seats back for a booking whose status does not change (hold rollback).
   * The releases are first recorded on the booking, so if a release fails the
   * scheduler retries it instead of the seats being lost (review A5).
   */
  private async giveBack(bookingId: Types.ObjectId, releases: SeatRelease[]) {
    if (!releases.length) return;
    try {
      await this.bookingModel.updateOne(
        { _id: bookingId },
        { $push: { pendingSeatReleases: { $each: releases } } },
      );
    } catch (e) {
      // Could not even record them: release directly as a last resort.
      this.logger.error(
        `Could not record seat releases for ${String(bookingId)}: ${String(e)}`,
      );
      for (const r of releases) await this.releaseWithRetry(r);
      return;
    }
    await this.processPendingReleases(bookingId);
  }

  /**
   * Releases every pending seat release of one booking. Each release is claimed by
   * removing it from the list first (atomic), so two callers never release the same
   * seats twice. A release that still fails after retries is put back for the scheduler.
   */
  async processPendingReleases(bookingId: Types.ObjectId) {
    const booking = await this.bookingModel
      .findById(bookingId)
      .select('pendingSeatReleases')
      .lean();
    for (const release of booking?.pendingSeatReleases ?? []) {
      const claimed = await this.bookingModel.findOneAndUpdate(
        { _id: bookingId, 'pendingSeatReleases._id': release._id },
        { $pull: { pendingSeatReleases: { _id: release._id } } },
      );
      if (!claimed) continue; // another caller is releasing it
      if (await this.releaseWithRetry(release)) continue;
      await this.bookingModel
        .updateOne(
          { _id: bookingId },
          { $push: { pendingSeatReleases: release } },
        )
        .catch((e: unknown) =>
          this.logger.error(
            `Seats of flight ${String(release.flightId)} could not be released or re-queued: ${String(e)}`,
          ),
        );
    }
  }

  /** Called every minute by the scheduler: retries releases that failed earlier. */
  async retryPendingReleases() {
    const waiting = await this.bookingModel
      .find({ 'pendingSeatReleases.0': { $exists: true } })
      .select('_id')
      .lean();
    for (const { _id } of waiting) await this.processPendingReleases(_id);
  }

  private async releaseWithRetry(r: SeatRelease): Promise<boolean> {
    for (let attempt = 1; attempt <= RELEASE_ATTEMPTS; attempt++) {
      try {
        await this.releaseSeats(r.flightId, r.cabinId, r.count);
        return true;
      } catch (e) {
        this.logger.warn(
          `Release of ${r.count} seat(s) on flight ${String(r.flightId)} failed (attempt ${attempt}): ${String(e)}`,
        );
      }
    }
    return false;
  }

  /** Called every minute by the scheduler. */
  async expireStaleHolds() {
    const stale = await this.bookingModel
      .find({
        status: FlightBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { $lte: new Date() },
      })
      .select('_id')
      .lean();
    for (const { _id } of stale) await this.expireOne(_id);
    if (stale.length)
      this.logger.log(`Expired ${stale.length} flight booking hold(s)`);
  }

  async expireOne(id: Types.ObjectId, force = false) {
    const booking = await this.bookingModel
      .findById(id)
      .select('segments seatCount')
      .lean();
    if (!booking) return;
    const filter: Record<string, unknown> = {
      _id: id,
      status: FlightBookingStatus.PENDING_PAYMENT,
    };
    if (!force) filter.holdExpiresAt = { $lte: new Date() };
    // Flip the status and record the seats to give back in ONE update; only the caller
    // that wins the flip queues the release, so seats are never released twice.
    const expired = await this.bookingModel.findOneAndUpdate(filter, {
      $set: { status: FlightBookingStatus.EXPIRED },
      $push: {
        pendingSeatReleases: {
          $each: seatReleasesFor(booking.segments, booking.seatCount),
        },
      },
    });
    if (!expired) return;
    await this.processPendingReleases(id);
    // TODO (when Youssef's PaymentsService exists): cancel the Stripe PaymentIntent (PAY-01)
  }

  /**
   * Changes a CONFIRMED booking's status (cancel) and queues its seats for release in
   * the same update, then releases them. Returns the updated booking, or null when the
   * booking was no longer CONFIRMED.
   */
  async cancelConfirmed(
    booking: FlightBookingDocument,
    set: Record<string, unknown>,
  ) {
    const cancelled = await this.bookingModel.findOneAndUpdate(
      { _id: booking._id, status: FlightBookingStatus.CONFIRMED },
      {
        $set: {
          status: FlightBookingStatus.CANCELLED,
          cancelledAt: new Date(),
          ...set,
        },
        $push: {
          pendingSeatReleases: {
            $each: seatReleasesFor(booking.segments, booking.seatCount),
          },
        },
      },
      { new: true },
    );
    if (cancelled) await this.processPendingReleases(booking._id);
    return cancelled;
  }
}
