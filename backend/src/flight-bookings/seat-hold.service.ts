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
   * requests can never overbook. Legs already reserved are given back if a later step fails.
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
      await this.releaseSegments(reserved, draft.seatCount);
      throw err instanceof HttpException
        ? err
        : new ConflictException('Not enough seats are available');
    }

    // Flip DRAFT -> PENDING_PAYMENT atomically. If two requests race on the same draft
    // (double click), only one wins; the loser gives its seats back.
    const held = await this.bookingModel.findOneAndUpdate(
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
    if (!held) {
      await this.releaseSegments(reserved, draft.seatCount);
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

  async releaseSegments(segments: Segment[], count: number) {
    for (const s of segments) {
      try {
        await this.releaseSeats(s.flightId, s.cabinId, count);
      } catch (e) {
        this.logger.error(
          `Failed to release ${count} seats on flight ${String(s.flightId)}: ${String(e)}`,
        );
      }
    }
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
    const filter: Record<string, unknown> = {
      _id: id,
      status: FlightBookingStatus.PENDING_PAYMENT,
    };
    if (!force) filter.holdExpiresAt = { $lte: new Date() };
    // Flip status FIRST; only the caller that wins the flip releases seats (never twice)
    const b = await this.bookingModel.findOneAndUpdate(
      filter,
      { $set: { status: FlightBookingStatus.EXPIRED } },
      { new: true },
    );
    if (!b) return;
    await this.releaseSegments(b.segments, b.seatCount);
    // TODO (when Youssef's PaymentsService exists): cancel the Stripe PaymentIntent (PAY-01)
  }
}
