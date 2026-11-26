import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators.js';
import { ProviderType, Role } from '../common/enums/index.js';
import { buildMeta } from '../common/utils/pagination.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationType } from '../notifications/notification-types.js';
import { Flight, FlightStatus } from '../flights/schemas/flight.schema.js';
import type { FlightDocument } from '../flights/schemas/flight.schema.js';
import { Airline } from '../airlines/schemas/airline.schema.js';
import type { AirlineDocument } from '../airlines/schemas/airline.schema.js';
import { FlightBooking, Segment } from './schemas/flight-booking.schema.js';
import type { FlightBookingDocument } from './schemas/flight-booking.schema.js';
import { FlightBookingStatus } from './flight-booking.enums.js';
import {
  CreateFlightBookingDto,
  SegmentSelectionDto,
} from './dto/create-flight-booking.dto.js';
import { ListFlightBookingsQueryDto } from './dto/list-flight-bookings.query.dto.js';
import { SeatHoldService } from './seat-hold.service.js';
import { seatCountFor, validatePassengers } from './domain/passenger-rules.js';
import { calculatePrice } from './domain/pricing.js';
import { computeRefund } from './domain/refund-rules.js';
import { generateBookingReference } from './domain/booking-reference.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Plain copy of a Mongoose subdocument (or of an already-plain object). */
function toPlain<T extends object>(doc: T): T {
  const withToObject = doc as T & { toObject?: () => T };
  return typeof withToObject.toObject === 'function'
    ? withToObject.toObject()
    : { ...doc };
}

/** Extra airline-policy fields required by FLT-08 / FLT-09 that the Airline schema may not have yet. */
type BaggagePolicyLike = {
  checkedBags?: number;
  checkedBagWeightKg?: number;
  extraBagPrice?: number;
  maxExtraBags?: number;
};
type CancellationPolicyLike = {
  refundable?: boolean;
  refundPercentage?: number;
  cancellationFee?: number;
  cancellationDeadlineHours?: number;
  tiers?: { daysBefore: number; refundPercent: number }[];
};

interface LoadedLeg {
  segment: Segment;
  availableSeats: number;
  currency: string;
}

@Injectable()
export class FlightBookingsService {
  private readonly logger = new Logger(FlightBookingsService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBookingDocument>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
    private readonly seatHolds: SeatHoldService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Loads one flight + cabin and checks that it can be booked (FLT-30, ACC-15). */
  private async loadLeg(sel: SegmentSelectionDto): Promise<LoadedLeg> {
    const flight = await this.flightModel.findById(sel.flightId).lean();
    if (!flight) throw new NotFoundException('Flight not found');
    if (flight.status !== FlightStatus.Scheduled)
      throw new ConflictException(
        `Flight ${flight.flightNumber} is not available for booking`,
      );
    if (new Date(flight.departureTime).getTime() <= Date.now())
      throw new ConflictException(
        `Flight ${flight.flightNumber} has already departed`,
      );

    const airline = await this.airlineModel.findById(flight.airlineId).lean();
    if (!airline || !airline.isActive)
      throw new ConflictException(
        'Bookings are not available for an inactive airline',
      );

    const cabin = flight.cabins.find((c) => String(c._id) === sel.cabinId);
    if (!cabin)
      throw new BadRequestException('Cabin does not belong to this flight');

    const baggage = (airline.baggagePolicy ?? {}) as BaggagePolicyLike;
    const cancel = (airline.cancellationPolicy ?? {}) as CancellationPolicyLike;

    return {
      availableSeats: cabin.availableSeats,
      currency: cabin.currency,
      segment: {
        flightId: new Types.ObjectId(sel.flightId),
        cabinId: new Types.ObjectId(sel.cabinId),
        airlineId: new Types.ObjectId(String(flight.airlineId)),
        flightNumber: flight.flightNumber,
        departureAirportId: new Types.ObjectId(
          String(flight.departureAirportId),
        ),
        arrivalAirportId: new Types.ObjectId(String(flight.arrivalAirportId)),
        departureAt: new Date(flight.departureTime),
        arrivalAt: new Date(flight.arrivalTime),
        cabinClass: cabin.cabinClass,
        unitPrice: cabin.price,
        freeCheckedBags: baggage.checkedBags ?? 0,
        checkedBagWeightKg: baggage.checkedBagWeightKg,
        extraBagPrice: baggage.extraBagPrice ?? 0,
        maxExtraBags: baggage.maxExtraBags ?? 0,
        cancellationTiers: cancel.tiers ?? [],
        refundable: cancel.refundable ?? false,
        refundPercentage: cancel.refundPercentage ?? 0,
        cancellationFee: cancel.cancellationFee ?? 0,
        cancellationDeadlineHours: cancel.cancellationDeadlineHours ?? 0,
      },
    };
  }

  private async findByIdOr404(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Booking not found');
    const b = await this.bookingModel.findById(id);
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  private notify(
    userId: unknown,
    type: string,
    title: string,
    message: string,
    bookingId: string,
  ) {
    return this.notifications
      .create({
        userId: String(userId),
        type,
        title,
        message,
        referenceType: 'flight_booking',
        referenceId: bookingId,
      })
      .catch((e) => this.logger.error(`Notification failed: ${String(e)}`));
  }

  // ---------------------------------------------------------------------------
  // FLT-19 / FLT-21: passenger details + booking summary (no seats taken yet)
  // ---------------------------------------------------------------------------

  async createDraft(user: AuthUser, dto: CreateFlightBookingDto) {
    const out = await this.loadLeg(dto.outbound);
    const back = dto.inbound ? await this.loadLeg(dto.inbound) : null;

    if (back) {
      const o = out.segment;
      const r = back.segment;
      if (
        String(r.departureAirportId) !== String(o.arrivalAirportId) ||
        String(r.arrivalAirportId) !== String(o.departureAirportId)
      )
        throw new BadRequestException(
          'The return flight must fly the reverse route',
        );
      if (r.departureAt <= o.arrivalAt)
        throw new BadRequestException(
          'The return flight must depart after the outbound flight arrives',
        );
      if (back.currency !== out.currency)
        throw new BadRequestException(
          'Both flights must be priced in the same currency',
        );
    }

    validatePassengers(dto.passengers, out.segment.departureAt);

    const legs = back ? [out, back] : [out];
    const segments = legs.map((l) => l.segment);
    const seatCount = seatCountFor(dto.passengers);

    for (const l of legs)
      if (l.availableSeats < seatCount)
        throw new ConflictException(
          `Not enough seats on flight ${l.segment.flightNumber}`,
        );

    const maxExtra = Math.min(...segments.map((s) => s.maxExtraBags));
    if (dto.passengers.some((p) => (p.extraBags ?? 0) > maxExtra))
      throw new BadRequestException(
        `Maximum ${maxExtra} extra bag(s) per passenger for this airline`,
      );

    return this.bookingModel.create({
      userId: new Types.ObjectId(user.id),
      flightId: segments[0].flightId,
      cabinId: segments[0].cabinId,
      segments,
      passengers: dto.passengers.map((p) => ({
        ...p,
        dateOfBirth: new Date(p.dateOfBirth),
        extraBags: p.extraBags ?? 0,
      })),
      seatCount,
      status: FlightBookingStatus.DRAFT,
      draftExpiresAt: new Date(Date.now() + DAY_MS),
      currency: out.currency,
      ...calculatePrice(segments, dto.passengers),
    });
  }

  // ---------------------------------------------------------------------------
  // FLT-22: hold seats for 10 minutes -> PENDING_PAYMENT
  // ---------------------------------------------------------------------------

  async hold(user: AuthUser, bookingId: string) {
    if (!isValidObjectId(bookingId))
      throw new NotFoundException('Draft booking not found');
    const draft = await this.bookingModel.findOne({
      _id: bookingId,
      userId: user.id,
      status: FlightBookingStatus.DRAFT,
    });
    if (!draft) throw new NotFoundException('Draft booking not found');

    // The flight may have been cancelled, or the airline deactivated, since the draft
    for (const s of draft.segments)
      await this.loadLeg({
        flightId: String(s.flightId),
        cabinId: String(s.cabinId),
      });

    const minutes = Number(process.env.FLIGHT_HOLD_MINUTES ?? 10);
    return this.seatHolds.holdDraft(draft, minutes);
  }

  /** Called every minute by the scheduler. */
  expireStaleHolds() {
    return this.seatHolds.expireStaleHolds();
  }

  // ---------------------------------------------------------------------------
  // FLT-23: confirmation after payment (Youssef's webhook calls these)
  // ---------------------------------------------------------------------------

  /** For Youssef: amount to charge. Throws if the booking is not awaiting payment. */
  async getPayableBooking(bookingId: string) {
    const b = await this.findByIdOr404(bookingId);
    if (
      b.status !== FlightBookingStatus.PENDING_PAYMENT ||
      !b.holdExpiresAt ||
      b.holdExpiresAt <= new Date()
    )
      throw new ConflictException(
        'Booking is not awaiting payment or the hold has expired',
      );
    return {
      id: b.id as string,
      userId: String(b.userId),
      amount: b.totalPrice,
      currency: b.currency,
      holdExpiresAt: b.holdExpiresAt,
    };
  }

  /**
   * For Youssef: call after Stripe confirms payment.
   * Returns the confirmed booking, or null if the hold already expired (then refund).
   */
  async confirmAfterPayment(bookingId: string, paymentId: string) {
    if (!isValidObjectId(bookingId)) return null;
    const b = await this.bookingModel.findById(bookingId);
    if (!b) return null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = generateBookingReference();
      // Copy every stored passenger field and add the ticket number, so fields added to
      // the schema later are not dropped (review D3, Joumana Hozayen).
      const passengers = b.passengers.map((p, i) => ({
        ...toPlain(p),
        ticketNumber: `${ref}-${String(i + 1).padStart(2, '0')}`,
      }));
      try {
        const confirmed = await this.bookingModel.findOneAndUpdate(
          {
            _id: b._id,
            status: FlightBookingStatus.PENDING_PAYMENT,
            holdExpiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: FlightBookingStatus.CONFIRMED,
              paymentId,
              confirmedAt: new Date(),
              bookingReference: ref,
              passengers,
            },
          },
          { new: true },
        );
        if (!confirmed) return null;
        await this.notify(
          confirmed.userId,
          NotificationType.BookingStateChanged,
          'Flight booking confirmed',
          `Your flight booking ${ref} is confirmed. Your e-ticket is ready to download.`,
          confirmed.id as string,
        );
        return confirmed;
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          e.code === 11000
        )
          continue; // duplicate ref
        throw e;
      }
    }
    throw new InternalServerErrorException(
      'Could not generate a booking reference',
    );
  }

  /** GEN-11: CONFIRMED -> COMPLETED once the last leg has departed. Called hourly. */
  async completeDeparted() {
    const res = await this.bookingModel.updateMany(
      {
        status: FlightBookingStatus.CONFIRMED,
        $expr: { $lt: [{ $max: '$segments.departureAt' }, '$$NOW'] },
      },
      { $set: { status: FlightBookingStatus.COMPLETED } },
    );
    if (res.modifiedCount)
      this.logger.log(`Completed ${res.modifiedCount} flight booking(s)`);
  }

  // ---------------------------------------------------------------------------
  // FLT-25 / ACC-11: listing and viewing
  // ---------------------------------------------------------------------------

  async listMine(user: AuthUser, q: ListFlightBookingsQueryDto) {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(user.id),
    };
    if (q.group === 'upcoming')
      filter.status = {
        $in: [
          FlightBookingStatus.PENDING_PAYMENT,
          FlightBookingStatus.CONFIRMED,
        ],
      };
    else if (q.group === 'past') filter.status = FlightBookingStatus.COMPLETED;
    else if (q.group === 'cancelled')
      filter.status = {
        $in: [FlightBookingStatus.CANCELLED, FlightBookingStatus.EXPIRED],
      };
    else filter.status = { $ne: FlightBookingStatus.DRAFT };

    const sort: Record<string, 1 | -1> =
      q.group === 'upcoming'
        ? { 'segments.0.departureAt': 1 }
        : { createdAt: -1 };
    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort(sort)
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);
    return { data, meta: buildMeta(total, q.page, q.limit) };
  }

  /** Owner, admin, or the moderator of the booked airline may view (ACC-11). */
  async findOneFor(user: AuthUser, id: string) {
    const b = await this.findByIdOr404(id);
    const isOwner = String(b.userId) === user.id;
    const isAdmin = user.role === Role.Admin;
    const isAirlineMod =
      user.role === Role.AirlineModerator &&
      user.assignedProvider?.type === ProviderType.Airline &&
      b.segments.some(
        (s) => String(s.airlineId) === user.assignedProvider?.providerId,
      );

    if (b.status === FlightBookingStatus.DRAFT && !isOwner)
      throw new NotFoundException('Booking not found');
    if (!isOwner && !isAdmin && !isAirlineMod)
      throw new ForbiddenException('You do not have access to this booking');
    return b;
  }

  /** For Habiba (ACC-12): block account deactivation while upcoming bookings exist. */
  async hasUpcomingConfirmedBookings(userId: string) {
    return !!(await this.bookingModel.exists({
      userId: new Types.ObjectId(userId),
      status: FlightBookingStatus.CONFIRMED,
    }));
  }

  // ---------------------------------------------------------------------------
  // FLT-26: cancellation with refund preview
  // ---------------------------------------------------------------------------

  computeRefund(b: FlightBookingDocument) {
    return computeRefund(b);
  }

  private async getCancellable(user: AuthUser, id: string) {
    const b = await this.findByIdOr404(id);
    if (String(b.userId) !== user.id)
      throw new ForbiddenException('You do not have access to this booking');
    if (b.status !== FlightBookingStatus.CONFIRMED)
      throw new ConflictException('Only confirmed bookings can be cancelled');
    if (b.segments[0].departureAt.getTime() <= Date.now())
      throw new ConflictException(
        'Bookings cannot be cancelled after departure',
      );
    return b;
  }

  async cancellationQuote(user: AuthUser, id: string) {
    return computeRefund(await this.getCancellable(user, id));
  }

  async cancel(user: AuthUser, id: string) {
    const b = await this.getCancellable(user, id);
    const quote = computeRefund(b);

    const cancelled = await this.bookingModel.findOneAndUpdate(
      { _id: b._id, status: FlightBookingStatus.CONFIRMED },
      {
        $set: {
          status: FlightBookingStatus.CANCELLED,
          cancelledAt: new Date(),
          refundAmount: quote.refundAmount,
        },
      },
      { new: true },
    );
    if (!cancelled)
      throw new ConflictException('Booking is no longer confirmed');

    await this.seatHolds.releaseSegments(
      cancelled.segments,
      cancelled.seatCount,
    );
    // TODO (when Youssef's PaymentsService exists): if quote.refundAmount > 0, create the
    // Stripe refund and save its id in cancelled.refundId (PAY-03).
    await this.notify(
      cancelled.userId,
      NotificationType.RefundUpdate,
      'Flight booking cancelled',
      `Booking ${cancelled.bookingReference} was cancelled. Refund: ${quote.refundAmount} ${quote.currency}.`,
      cancelled.id as string,
    );
    return { booking: cancelled, ...quote };
  }

  /**
   * For Mahmoud's flight cancellation (FLT-06): confirmed bookings are cancelled
   * with a 100% refund, holds expire and release seats, passengers are notified.
   */
  async cancelAllForFlight(flightId: string) {
    const affected = await this.bookingModel.find({
      'segments.flightId': new Types.ObjectId(flightId),
      status: {
        $in: [
          FlightBookingStatus.PENDING_PAYMENT,
          FlightBookingStatus.CONFIRMED,
        ],
      },
    });
    for (const b of affected) {
      if (b.status === FlightBookingStatus.PENDING_PAYMENT) {
        await this.seatHolds.expireOne(b._id, true);
        continue;
      }
      const c = await this.bookingModel.findOneAndUpdate(
        { _id: b._id, status: FlightBookingStatus.CONFIRMED },
        {
          $set: {
            status: FlightBookingStatus.CANCELLED,
            cancelledAt: new Date(),
            refundAmount: b.totalPrice,
          },
        },
        { new: true },
      );
      if (!c) continue;
      await this.seatHolds.releaseSegments(c.segments, c.seatCount);
      // TODO (Youssef): full refund of c.totalPrice
      await this.notify(
        c.userId,
        NotificationType.FlightCancelled,
        'Flight cancelled by the airline',
        `Your flight was cancelled. Booking ${c.bookingReference} will be fully refunded.`,
        c.id as string,
      );
    }
    return { affected: affected.length };
  }

  // ---------------------------------------------------------------------------
  // E-ticket data (FLT-23)
  // ---------------------------------------------------------------------------

  async eTicketBooking(user: AuthUser, id: string) {
    const b = await this.findOneFor(user, id);
    if (
      b.status !== FlightBookingStatus.CONFIRMED &&
      b.status !== FlightBookingStatus.COMPLETED
    )
      throw new ConflictException(
        'The e-ticket is only available for confirmed bookings',
      );
    return b;
  }
}
