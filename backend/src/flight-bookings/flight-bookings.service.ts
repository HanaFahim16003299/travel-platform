import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { BookingGatewayRegistry } from '../payments/booking-gateway.registry.js';
import { BookingType } from '../payments/enums/payment.enums.js';
import { PaymentsService } from '../payments/payments.service.js';
import { RefundsService } from '../payments/refunds.service.js';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../auth/decorators.js';
import { ProviderType, Role } from '../common/enums/index.js';
import { buildMeta } from '../common/utils/pagination.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationType } from '../notifications/notification-types.js';
import { FlightsService } from '../flights/flights.service.js';
import { Flight, FlightStatus } from '../flights/schemas/flight.schema.js';
import type { FlightDocument } from '../flights/schemas/flight.schema.js';
import { Airline } from '../airlines/schemas/airline.schema.js';
import type { AirlineDocument } from '../airlines/schemas/airline.schema.js';
import { FlightBooking, Segment } from './schemas/flight-booking.schema.js';
import type { FlightBookingDocument } from './schemas/flight-booking.schema.js';
import { FlightBookingStatus as S, PassengerType } from './flight-booking.enums.js';
import { CreateFlightBookingDto, SegmentSelectionDto } from './dto/create-flight-booking.dto.js';
import { PassengerDto } from './dto/passenger.dto.js';
import { ListFlightBookingsQueryDto } from './dto/list-flight-bookings.query.dto.js';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const INFANT_FARE_FACTOR = 0.1; // FLT-12: infants pay 10%
const round2 = (x: number) => Math.round(x * 100) / 100;

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
export class FlightBookingsService implements OnModuleInit {
  private readonly logger = new Logger(FlightBookingsService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBookingDocument>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
    private readonly flightsService: FlightsService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly paymentsService?: PaymentsService,
    @Optional() private readonly refundsService?: RefundsService,
    @Optional() private readonly gatewayRegistry?: BookingGatewayRegistry,
  ) {}

  onModuleInit() {
    this.gatewayRegistry?.register(BookingType.Flight, {
      getPolicies: (user, id) => this.getPolicies(user, id),
      acceptPolicies: (user, id) => this.acceptPolicies(user, id),
      getPayableBooking: (id) => this.getPayableBooking(id),
      confirmAfterPayment: async (id, paymentId) =>
        (await this.confirmAfterPayment(id, paymentId)) !== null,
      expireIfDue: (id) => this.expireIfDue(id),
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
      throw new ConflictException(`Flight ${flight.flightNumber} is not available for booking`);
    if (new Date(flight.departureTime).getTime() <= Date.now())
      throw new ConflictException(`Flight ${flight.flightNumber} has already departed`);

    const airline = await this.airlineModel.findById(flight.airlineId).lean();
    if (!airline || !airline.isActive)
      throw new ConflictException('Bookings are not available for an inactive airline');

    const cabin = flight.cabins.find((c) => String(c._id) === sel.cabinId);
    if (!cabin) throw new BadRequestException('Cabin does not belong to this flight');

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
        departureAirportId: new Types.ObjectId(String(flight.departureAirportId)),
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

  private ageOn(dob: Date, on: Date): number {
    let age = on.getUTCFullYear() - dob.getUTCFullYear();
    const m = on.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
    return age;
  }

  /** FLT-12 / FLT-19 passenger rules. */
  private validatePassengers(passengers: PassengerDto[], travelDate: Date) {
    const adults = passengers.filter((p) => p.type === PassengerType.ADULT).length;
    const infants = passengers.filter((p) => p.type === PassengerType.INFANT).length;
    if (adults === 0) throw new BadRequestException('At least one adult is required');
    // Infants sit on an adult's lap, so at most one infant per adult (documented assumption)
    if (infants > adults) throw new BadRequestException('Each infant must travel with an adult');

    for (const p of passengers) {
      const name = `${p.firstName} ${p.lastName}`;
      const age = this.ageOn(new Date(p.dateOfBirth), travelDate);
      if (age < 0) throw new BadRequestException(`${name}: date of birth is after the flight`);
      // Assumption: infant under 2, child 2–11, adult 12+ on the travel date
      const expected =
        age < 2 ? PassengerType.INFANT : age < 12 ? PassengerType.CHILD : PassengerType.ADULT;
      if (p.type !== expected)
        throw new BadRequestException(
          `${name} is ${age} on the travel date, so the passenger type must be ${expected}`,
        );
      if (p.type === PassengerType.ADULT && (!p.email || !p.phone))
        throw new BadRequestException(`${name}: email and phone are required for adults`);
    }
  }

  /** Price per leg: seats × fare + infants × 10% fare + extra bags × bag price. */
  private price(segments: Segment[], passengers: PassengerDto[]) {
    const seatPax = passengers.filter((p) => p.type !== PassengerType.INFANT).length;
    const infants = passengers.length - seatPax;
    const bags = passengers.reduce((n, p) => n + (p.extraBags ?? 0), 0);
    let baseFare = 0;
    let baggageFees = 0;
    for (const s of segments) {
      baseFare += seatPax * s.unitPrice + infants * INFANT_FARE_FACTOR * s.unitPrice;
      baggageFees += bags * s.extraBagPrice; // charged on each leg
    }
    return {
      baseFare: round2(baseFare),
      baggageFees: round2(baggageFees),
      totalPrice: round2(baseFare + baggageFees),
    };
  }

  /** Gives seats back to a cabin (the opposite of FlightsService.reserveSeats). */
  private async releaseSeats(flightId: Types.ObjectId, cabinId: Types.ObjectId, count: number) {
    await this.flightModel.updateOne(
      { _id: flightId, 'cabins._id': cabinId },
      { $inc: { 'cabins.$.availableSeats': count } },
    );
  }

  private async releaseSegments(segments: Segment[], count: number) {
    for (const s of segments) {
      try {
        await this.releaseSeats(s.flightId, s.cabinId, count);
      } catch (e) {
        this.logger.error(`Failed to release ${count} seats on flight ${String(s.flightId)}: ${String(e)}`);
      }
    }
  }

  private generateReference(): string {
    return Array.from(randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  }

  private async findByIdOr404(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Booking not found');
    const b = await this.bookingModel.findById(id);
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  private notify(userId: unknown, type: string, title: string, message: string, bookingId: string) {
    return this.notifications
      .create({ userId: String(userId), type, title, message, referenceType: 'flight_booking', referenceId: bookingId })
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
      if (String(r.departureAirportId) !== String(o.arrivalAirportId) || String(r.arrivalAirportId) !== String(o.departureAirportId))
        throw new BadRequestException('The return flight must fly the reverse route');
      if (r.departureAt <= o.arrivalAt)
        throw new BadRequestException('The return flight must depart after the outbound flight arrives');
      if (back.currency !== out.currency)
        throw new BadRequestException('Both flights must be priced in the same currency');
    }

    this.validatePassengers(dto.passengers, out.segment.departureAt);

    const legs = back ? [out, back] : [out];
    const segments = legs.map((l) => l.segment);
    const seatCount = dto.passengers.filter((p) => p.type !== PassengerType.INFANT).length;

    for (const l of legs)
      if (l.availableSeats < seatCount)
        throw new ConflictException(`Not enough seats on flight ${l.segment.flightNumber}`);

    const maxExtra = Math.min(...segments.map((s) => s.maxExtraBags));
    if (dto.passengers.some((p) => (p.extraBags ?? 0) > maxExtra))
      throw new BadRequestException(`Maximum ${maxExtra} extra bag(s) per passenger for this airline`);

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
      status: S.DRAFT,
      draftExpiresAt: new Date(Date.now() + DAY_MS),
      currency: out.currency,
      ...this.price(segments, dto.passengers),
    });
  }

  // ---------------------------------------------------------------------------
  // FLT-22: hold seats for 10 minutes -> PENDING_PAYMENT
  // ---------------------------------------------------------------------------

  async hold(user: AuthUser, bookingId: string) {
    if (!isValidObjectId(bookingId)) throw new NotFoundException('Draft booking not found');
    const draft = await this.bookingModel.findOne({ _id: bookingId, userId: user.id, status: S.DRAFT });
    if (!draft) throw new NotFoundException('Draft booking not found');

    // The flight may have been cancelled, or the airline deactivated, since the draft
    for (const s of draft.segments)
      await this.loadLeg({ flightId: String(s.flightId), cabinId: String(s.cabinId) });

    // 1. Reserve seats leg by leg. reserveSeats is atomic (check + decrement in one
    //    MongoDB operation), so concurrent requests can never overbook.
    const reserved: Segment[] = [];
    try {
      for (const s of draft.segments) {
        await this.flightsService.reserveSeats(String(s.flightId), String(s.cabinId), draft.seatCount);
        reserved.push(s);
      }
    } catch (err) {
      await this.releaseSegments(reserved, draft.seatCount); // undo the legs already reserved
      throw err instanceof HttpException ? err : new ConflictException('Not enough seats are available');
    }

    // 2. Flip DRAFT -> PENDING_PAYMENT atomically. If two requests race on the
    //    same draft (double click), only one wins; the loser gives its seats back.
    const minutes = Number(process.env.FLIGHT_HOLD_MINUTES ?? 10);
    const held = await this.bookingModel.findOneAndUpdate(
      { _id: draft._id, status: S.DRAFT },
      {
        $set: { status: S.PENDING_PAYMENT, holdExpiresAt: new Date(Date.now() + minutes * 60_000) },
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

  /** Called every minute by the scheduler. */
  async expireStaleHolds() {
    const stale = await this.bookingModel
      .find({ status: S.PENDING_PAYMENT, holdExpiresAt: { $lte: new Date() } })
      .select('_id')
      .lean();
    for (const { _id } of stale) await this.expireOne(_id);
    if (stale.length) this.logger.log(`Expired ${stale.length} flight booking hold(s)`);
  }

  /** For Youssef: expire a pending booking if its hold deadline has passed. */
  async expireIfDue(bookingId: string) {
    if (!isValidObjectId(bookingId)) return;
    await this.expireOne(new Types.ObjectId(bookingId), false);
  }

  private async expireOne(id: Types.ObjectId, force = false) {
    const filter: Record<string, unknown> = { _id: id, status: S.PENDING_PAYMENT };
    if (!force) filter.holdExpiresAt = { $lte: new Date() };
    // Flip status FIRST; only the caller that wins the flip releases seats (never twice)
    const b = await this.bookingModel.findOneAndUpdate(filter, { $set: { status: S.EXPIRED } }, { new: true });
    if (!b) return;
    await this.releaseSegments(b.segments, b.seatCount);
    await this.paymentsService?.cancelPendingPaymentForBooking(BookingType.Flight, b.id as string);
  }

  // ---------------------------------------------------------------------------
  // FLT-23: confirmation after payment (Youssef's webhook calls these)
  // ---------------------------------------------------------------------------

  /** For Youssef: amount to charge. Throws if the booking is not awaiting payment. */
  async getPayableBooking(bookingId: string) {
    const b = await this.findByIdOr404(bookingId);
    if (b.status !== S.PENDING_PAYMENT || !b.holdExpiresAt || b.holdExpiresAt <= new Date())
      throw new ConflictException('Booking is not awaiting payment or the hold has expired');
    return {
      id: b.id as string,
      userId: String(b.userId),
      amount: b.totalPrice,
      currency: b.currency,
      holdExpiresAt: b.holdExpiresAt,
      policyAcceptedAt: b.policyAcceptedAt ?? null,
    };
  }

  /** For Youssef (PAY-02): return provider baggage & cancellation policies stored on the booking. */
  async getPolicies(user: AuthUser, id: string) {
    const b = await this.findByIdOr404(id);
    if (String(b.userId) !== user.id && user.role !== Role.Admin) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    return {
      bookingType: 'flight',
      bookingId: b.id as string,
      status: b.status,
      totalPrice: b.totalPrice,
      currency: b.currency,
      policyAcceptedAt: b.policyAcceptedAt ?? null,
      segments: b.segments.map((seg) => ({
        flightId: String(seg.flightId),
        airlineId: String(seg.airlineId),
        flightNumber: seg.flightNumber,
        cabinClass: seg.cabinClass,
        baggagePolicy: {
          freeCheckedBags: seg.freeCheckedBags,
          checkedBagWeightKg: seg.checkedBagWeightKg ?? null,
          extraBagPrice: seg.extraBagPrice,
          maxExtraBags: seg.maxExtraBags,
        },
        cancellationPolicy: {
          cancellationTiers: seg.cancellationTiers,
          refundable: seg.refundable,
          refundPercentage: seg.refundPercentage,
          cancellationFee: seg.cancellationFee,
          cancellationDeadlineHours: seg.cancellationDeadlineHours,
        },
      })),
    };
  }

  /** For Youssef (PAY-02): record policy acceptance with a timestamp. */
  async acceptPolicies(user: AuthUser, id: string) {
    const b = await this.findByIdOr404(id);
    if (String(b.userId) !== user.id) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    if (b.status !== S.PENDING_PAYMENT || !b.holdExpiresAt || b.holdExpiresAt <= new Date()) {
      throw new ConflictException('Booking is not awaiting payment or the hold has expired');
    }
    if (!b.policyAcceptedAt) {
      b.policyAcceptedAt = new Date();
      await b.save();
    }
    return {
      bookingType: 'flight',
      bookingId: b.id as string,
      accepted: true,
      policyAcceptedAt: b.policyAcceptedAt,
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
      const ref = this.generateReference();
      const passengers = b.passengers.map((p, i) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        documentNumber: p.documentNumber,
        type: p.type,
        email: p.email,
        phone: p.phone,
        extraBags: p.extraBags,
        ticketNumber: `${ref}-${String(i + 1).padStart(2, '0')}`,
      }));
      try {
        const confirmed = await this.bookingModel.findOneAndUpdate(
          { _id: b._id, status: S.PENDING_PAYMENT, holdExpiresAt: { $gt: new Date() } },
          { $set: { status: S.CONFIRMED, paymentId, confirmedAt: new Date(), bookingReference: ref, passengers } },
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
        if (typeof e === 'object' && e !== null && 'code' in e && e.code === 11000) continue; // duplicate ref
        throw e;
      }
    }
    throw new InternalServerErrorException('Could not generate a booking reference');
  }

  /** GEN-11: CONFIRMED -> COMPLETED once the last leg has departed. Called hourly. */
  async completeDeparted() {
    const res = await this.bookingModel.updateMany(
      { status: S.CONFIRMED, $expr: { $lt: [{ $max: '$segments.departureAt' }, '$$NOW'] } },
      { $set: { status: S.COMPLETED } },
    );
    if (res.modifiedCount) this.logger.log(`Completed ${res.modifiedCount} flight booking(s)`);
  }

  // ---------------------------------------------------------------------------
  // FLT-25 / ACC-11: listing and viewing
  // ---------------------------------------------------------------------------

  async listMine(user: AuthUser, q: ListFlightBookingsQueryDto) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(user.id) };
    if (q.group === 'upcoming') filter.status = { $in: [S.PENDING_PAYMENT, S.CONFIRMED] };
    else if (q.group === 'past') filter.status = S.COMPLETED;
    else if (q.group === 'cancelled') filter.status = { $in: [S.CANCELLED, S.EXPIRED] };
    else filter.status = { $ne: S.DRAFT };

    const sort: Record<string, 1 | -1> =
      q.group === 'upcoming' ? { 'segments.0.departureAt': 1 } : { createdAt: -1 };
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
      b.segments.some((s) => String(s.airlineId) === user.assignedProvider?.providerId);

    if (b.status === S.DRAFT && !isOwner) throw new NotFoundException('Booking not found');
    if (!isOwner && !isAdmin && !isAirlineMod)
      throw new ForbiddenException('You do not have access to this booking');
    return b;
  }

  /** For Habiba (ACC-12): block account deactivation while upcoming bookings exist. */
  async hasUpcomingConfirmedBookings(userId: string) {
    return !!(await this.bookingModel.exists({ userId: new Types.ObjectId(userId), status: S.CONFIRMED }));
  }

  // ---------------------------------------------------------------------------
  // FLT-26: cancellation with refund preview
  // ---------------------------------------------------------------------------

  /**
   * Refund rule:
   *  - If the airline has tiers (FLT-09): the highest daysBefore threshold that
   *    still applies wins; no match = 0%.
   *  - Otherwise the airline's single policy: non-refundable = 0; inside the
   *    deadline = 0; else total × refundPercentage − cancellationFee.
   */
  computeRefund(b: FlightBookingDocument) {
    const seg = b.segments[0];
    const msLeft = seg.departureAt.getTime() - Date.now();
    const daysBeforeDeparture = Math.floor(msLeft / DAY_MS);
    let refundPercent = 0;
    let fee = 0;
    let rule: string;

    if (seg.cancellationTiers?.length) {
      const tiers = [...seg.cancellationTiers].sort((a, c) => c.daysBefore - a.daysBefore);
      const tier = tiers.find((t) => daysBeforeDeparture >= t.daysBefore);
      refundPercent = tier?.refundPercent ?? 0;
      rule = tier
        ? `Cancelled ${daysBeforeDeparture} days before departure: ${tier.daysBefore}+ days tier gives ${refundPercent}%`
        : `Cancelled ${daysBeforeDeparture} days before departure: no tier applies, 0%`;
    } else if (!seg.refundable) {
      rule = 'Non-refundable fare';
    } else if (msLeft < seg.cancellationDeadlineHours * HOUR_MS) {
      rule = `Cancelled within ${seg.cancellationDeadlineHours} hours of departure: no refund`;
    } else {
      refundPercent = seg.refundPercentage;
      fee = seg.cancellationFee;
      rule = `${refundPercent}% refund minus ${fee} ${b.currency} cancellation fee`;
    }

    const refundAmount = Math.max(0, round2((b.totalPrice * refundPercent) / 100 - fee));
    return { daysBeforeDeparture, refundPercent, cancellationFee: fee, refundAmount, currency: b.currency, rule };
  }

  private async getCancellable(user: AuthUser, id: string) {
    const b = await this.findByIdOr404(id);
    if (String(b.userId) !== user.id) throw new ForbiddenException('You do not have access to this booking');
    if (b.status !== S.CONFIRMED) throw new ConflictException('Only confirmed bookings can be cancelled');
    if (b.segments[0].departureAt.getTime() <= Date.now())
      throw new ConflictException('Bookings cannot be cancelled after departure');
    return b;
  }

  async cancellationQuote(user: AuthUser, id: string) {
    return this.computeRefund(await this.getCancellable(user, id));
  }

  async cancel(user: AuthUser, id: string) {
    const b = await this.getCancellable(user, id);
    const quote = this.computeRefund(b);

    const cancelled = await this.bookingModel.findOneAndUpdate(
      { _id: b._id, status: S.CONFIRMED },
      { $set: { status: S.CANCELLED, cancelledAt: new Date(), refundAmount: quote.refundAmount } },
      { new: true },
    );
    if (!cancelled) throw new ConflictException('Booking is no longer confirmed');

    await this.releaseSegments(cancelled.segments, cancelled.seatCount);
    if (quote.refundAmount > 0 && this.refundsService) {
      const refund = await this.refundsService.processRefundForBooking({
        bookingType: BookingType.Flight,
        bookingId: cancelled.id as string,
        userId: String(cancelled.userId),
        amount: quote.refundAmount,
        currency: quote.currency,
        reason: quote.rule,
      });
      if (refund) {
        cancelled.refundId = String(refund._id);
        await cancelled.save();
      }
    }
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
      status: { $in: [S.PENDING_PAYMENT, S.CONFIRMED] },
    });
    for (const b of affected) {
      if (b.status === S.PENDING_PAYMENT) {
        await this.expireOne(b._id, true);
        continue;
      }
      const c = await this.bookingModel.findOneAndUpdate(
        { _id: b._id, status: S.CONFIRMED },
        { $set: { status: S.CANCELLED, cancelledAt: new Date(), refundAmount: b.totalPrice } },
        { new: true },
      );
      if (!c) continue;
      await this.releaseSegments(c.segments, c.seatCount);
      if (c.totalPrice > 0 && this.refundsService) {
        const refund = await this.refundsService.processRefundForBooking({
          bookingType: BookingType.Flight,
          bookingId: c.id as string,
          userId: String(c.userId),
          amount: c.totalPrice,
          currency: c.currency,
          reason: 'Flight cancelled by the airline',
        });
        if (refund) {
          c.refundId = String(refund._id);
          await c.save();
        }
      }
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
    if (b.status !== S.CONFIRMED && b.status !== S.COMPLETED)
      throw new ConflictException('The e-ticket is only available for confirmed bookings');
    return b;
  }
}
