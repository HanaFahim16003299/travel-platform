import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators.js';
import { ProviderType, Role } from '../common/enums/index.js';
import { buildMeta } from '../common/utils/pagination.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationType } from '../notifications/notification-types.js';
import { Flight, FlightStatus } from '../flights/schemas/flight.schema.js';
import { FlightCancellationHooks } from '../flights/flight-cancellation.hooks.js';
import type { FlightDocument } from '../flights/schemas/flight.schema.js';
import { Airline } from '../airlines/schemas/airline.schema.js';
import type { AirlineDocument } from '../airlines/schemas/airline.schema.js';
import { FlightBooking, Segment } from './schemas/flight-booking.schema.js';
import type { FlightBookingDocument } from './schemas/flight-booking.schema.js';
import { FlightBookingStatus, RefundStatus } from './flight-booking.enums.js';
import {
  CreateFlightBookingDto,
  SegmentSelectionDto,
} from './dto/create-flight-booking.dto.js';
import { ListFlightBookingsQueryDto } from './dto/list-flight-bookings.query.dto.js';
import { SeatHoldService } from './seat-hold.service.js';
import {
  parseDateOfBirth,
  seatCountFor,
  validatePassengers,
} from './domain/passenger-rules.js';
import { calculatePrice } from './domain/pricing.js';
import { legsChanged } from './domain/leg-snapshot.js';
import { parseHoldMinutes } from './domain/hold-settings.js';
import { computeRefund } from './domain/refund-rules.js';
import { generateBookingReference } from './domain/booking-reference.js';
import { toRestrictedBookingView } from './domain/booking-views.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Review C4: limits that stop one user hoarding seats or piling up drafts. Joumana Hozayen. */
export const MAX_OPEN_DRAFTS_PER_USER = 5;
export const MAX_ACTIVE_HOLDS_PER_USER = 2;

/** Plain copy of a Mongoose subdocument (or of an already-plain object). */
function toPlain<T extends object>(doc: T): T {
  const withToObject = doc as T & { toObject?: () => T };
  return typeof withToObject.toObject === 'function'
    ? withToObject.toObject()
    : { ...doc };
}

interface LoadedLeg {
  segment: Segment;
  availableSeats: number;
  currency: string;
}

@Injectable()
export class FlightBookingsService implements OnModuleInit {
  private readonly logger = new Logger(FlightBookingsService.name);
  /** FLT-22 hold length, read and validated once at startup (review C5, Joumana Hozayen). */
  private readonly holdMinutes = parseHoldMinutes(
    process.env.FLIGHT_HOLD_MINUTES,
  );

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBookingDocument>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
    private readonly seatHolds: SeatHoldService,
    private readonly notifications: NotificationsService,
    private readonly flightCancellations: FlightCancellationHooks,
  ) {}

  /** FLT-06: when an airline cancels a flight, cancel its bookings (review A3, Joumana Hozayen). */
  onModuleInit() {
    this.flightCancellations.register({
      onFlightCancelled: (flightId) => this.cancelAllForFlight(flightId),
    });
  }

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

    // FLT-08 / FLT-09 policies come straight from the Airline schema (review A1).
    const baggage = airline.baggagePolicy;
    const cancel = airline.cancellationPolicy;

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
        freeCheckedBags: baggage?.checkedBags ?? 0,
        checkedBagWeightKg: baggage?.checkedBagWeightKg,
        extraBagPrice: baggage?.extraBagPrice ?? 0,
        maxExtraBags: baggage?.maxExtraBags ?? 0,
        cancellationTiers: cancel?.tiers ?? [],
        refundable: cancel?.refundable ?? false,
        refundPercentage: cancel?.refundPercentage ?? 0,
        cancellationFee: cancel?.cancellationFee ?? 0,
        cancellationDeadlineHours: cancel?.cancellationDeadlineHours ?? 0,
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
    const openDrafts = await this.bookingModel.countDocuments({
      userId: new Types.ObjectId(user.id),
      status: FlightBookingStatus.DRAFT,
    });
    if (openDrafts >= MAX_OPEN_DRAFTS_PER_USER)
      throw new HttpException(
        `You already have ${MAX_OPEN_DRAFTS_PER_USER} unfinished bookings. Hold or let one expire before starting another.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
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

    // Every leg's date is checked (review C2).
    validatePassengers(
      dto.passengers,
      [out, back].flatMap((l) => (l ? [l.segment.departureAt] : [])),
    );

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
        dateOfBirth: parseDateOfBirth(p.dateOfBirth),
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

  async hold(user: AuthUser, bookingId: string, acceptPolicies: boolean) {
    // PAY-02: the airline policies must be accepted before payment (review B2).
    if (acceptPolicies !== true)
      throw new BadRequestException(
        'You must accept the airline baggage and cancellation policies before holding seats',
      );
    if (!isValidObjectId(bookingId))
      throw new NotFoundException('Draft booking not found');
    const draft = await this.bookingModel.findOne({
      _id: bookingId,
      userId: user.id,
      status: FlightBookingStatus.DRAFT,
    });
    if (!draft) throw new NotFoundException('Draft booking not found');

    const activeHolds = await this.bookingModel.countDocuments({
      userId: new Types.ObjectId(user.id),
      status: FlightBookingStatus.PENDING_PAYMENT,
      holdExpiresAt: { $gt: new Date() },
    });
    if (activeHolds >= MAX_ACTIVE_HOLDS_PER_USER)
      throw new HttpException(
        `You already hold seats for ${MAX_ACTIVE_HOLDS_PER_USER} bookings. Pay for one or let a hold expire first.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );

    // The flight may have been cancelled, or the airline deactivated, since the draft
    const current = [];
    for (const s of draft.segments)
      current.push(
        await this.loadLeg({
          flightId: String(s.flightId),
          cabinId: String(s.cabinId),
        }),
      );

    // Decision (review C4): a draft can be up to 24 hours old, so hold() re-checks the
    // price and policies. If they changed, the user did not agree to them (FLT-21, PAY-02):
    // the draft is updated with the new price and policies and the hold is refused, so
    // the user reviews the new summary and holds again.
    const segments = current.map((l) => l.segment);
    if (legsChanged(draft.segments, segments)) {
      await this.bookingModel.updateOne(
        { _id: draft._id, status: FlightBookingStatus.DRAFT },
        { $set: { segments, ...calculatePrice(segments, draft.passengers) } },
      );
      throw new ConflictException(
        'The price or airline policies changed since your booking summary. Review the updated booking and hold again.',
      );
    }
    const maxExtra = Math.min(...segments.map((s) => s.maxExtraBags));
    if (draft.passengers.some((p) => p.extraBags > maxExtra))
      throw new BadRequestException(
        `Maximum ${maxExtra} extra bag(s) per passenger for this airline`,
      );

    return this.seatHolds.holdDraft(draft, this.holdMinutes, new Date());
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
      policyAcceptedAt: b.policyAcceptedAt ?? null,
    };
  }

  /**
   * For Youssef: call after Stripe confirms payment. Safe to call more than once for the
   * same payment (Stripe may deliver a webhook twice). Review A2, Joumana Hozayen.
   *
   * Returns:
   *  - the booking when it is now CONFIRMED by this payment, including when an earlier
   *    call with the same paymentId already confirmed it (nothing is changed or re-sent);
   *  - null only when the booking cannot be confirmed by this payment: it does not exist,
   *    its hold expired, or it is in another final state (EXPIRED, CANCELLED, or already
   *    paid by a different payment). Only then should the payment be refunded.
   */
  async confirmAfterPayment(bookingId: string, paymentId: string) {
    if (!isValidObjectId(bookingId)) return null;
    const b = await this.bookingModel.findById(bookingId);
    if (!b) return null;
    if (b.status !== FlightBookingStatus.PENDING_PAYMENT)
      return this.alreadyConfirmedBy(b, paymentId);

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
        if (!confirmed) {
          // Lost a race: a parallel delivery of the same webhook may have confirmed it.
          const current = await this.bookingModel.findById(b._id);
          return current ? this.alreadyConfirmedBy(current, paymentId) : null;
        }
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

  /** The booking if this same payment already confirmed it, otherwise null. */
  private alreadyConfirmedBy(b: FlightBookingDocument, paymentId: string) {
    const confirmedStates = [
      FlightBookingStatus.CONFIRMED,
      FlightBookingStatus.COMPLETED,
    ];
    return confirmedStates.includes(b.status) && b.paymentId === paymentId
      ? b
      : null;
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

  /**
   * GET /flight-bookings/:id. The owner sees everything; an admin or the airline's
   * moderator gets a reduced view without passport numbers, dates of birth, emails or
   * phones (review C3, Joumana Hozayen).
   */
  async viewFor(user: AuthUser, id: string) {
    const b = await this.findOneFor(user, id);
    return String(b.userId) === user.id ? b : toRestrictedBookingView(b);
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

    // Status change and seat release are recorded in one update (review A5).
    const cancelled = await this.seatHolds.cancelConfirmed(b, {
      refundAmount: quote.refundAmount,
      ...(quote.refundAmount > 0 && { refundStatus: RefundStatus.PENDING }),
    });
    if (!cancelled)
      throw new ConflictException('Booking is no longer confirmed');

    // TODO (PAY-03, Youssef's payments module): when quote.refundAmount > 0, create the
    // Stripe refund here and report it back through recordRefund().
    // The message says "pending" until the refund really exists (review B3).
    await this.notify(
      cancelled.userId,
      NotificationType.RefundUpdate,
      'Flight booking cancelled',
      quote.refundAmount > 0
        ? `Booking ${cancelled.bookingReference} was cancelled. A refund of ${quote.refundAmount} ${quote.currency} is pending; you will be notified when it is processed.`
        : `Booking ${cancelled.bookingReference} was cancelled. No refund applies under the airline's cancellation policy.`,
      cancelled.id as string,
    );
    return { booking: cancelled, ...quote };
  }

  /**
   * FLT-06: runs when FlightsService.cancel cancels a flight (registered in onModuleInit).
   * Pending holds expire and release their seats; confirmed bookings are cancelled with a
   * 100% refund amount and release their seats; every affected passenger is notified.
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
        await this.notify(
          b.userId,
          NotificationType.FlightCancelled,
          'Flight cancelled by the airline',
          'A flight in your unpaid booking was cancelled, so the booking was released. You were not charged.',
          b.id as string,
        );
        continue;
      }
      const c = await this.seatHolds.cancelConfirmed(b, {
        refundAmount: b.totalPrice,
        refundStatus: RefundStatus.PENDING,
      });
      if (!c) continue;
      // TODO (PAY-03, Youssef's payments module): create the Stripe refund for the full
      // c.totalPrice here and report it back through recordRefund().
      await this.notify(
        c.userId,
        NotificationType.FlightCancelled,
        'Flight cancelled by the airline',
        `Your flight was cancelled. A full refund of ${c.totalPrice} ${c.currency} for booking ${c.bookingReference} is pending; you will be notified when it is processed.`,
        c.id as string,
      );
    }
    return { affected: affected.length };
  }

  /**
   * PAY-03 hook for the payment module: records the Stripe refund of a cancelled booking
   * and tells the user once it is REFUNDED or FAILED. Review B3, Joumana Hozayen.
   */
  async recordRefund(
    bookingId: string,
    refundId: string,
    refundStatus: RefundStatus,
  ) {
    if (!isValidObjectId(bookingId))
      throw new NotFoundException('Cancelled booking not found');
    const b = await this.bookingModel.findOneAndUpdate(
      { _id: bookingId, status: FlightBookingStatus.CANCELLED },
      { $set: { refundId, refundStatus } },
      { new: true },
    );
    if (!b) throw new NotFoundException('Cancelled booking not found');
    if (refundStatus !== RefundStatus.PENDING)
      await this.notify(
        b.userId,
        NotificationType.RefundUpdate,
        refundStatus === RefundStatus.REFUNDED
          ? 'Refund processed'
          : 'Refund failed',
        refundStatus === RefundStatus.REFUNDED
          ? `Your refund of ${b.refundAmount} ${b.currency} for booking ${b.bookingReference} was processed.`
          : `The refund for booking ${b.bookingReference} failed. Please contact support.`,
        b.id as string,
      );
    return b;
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
