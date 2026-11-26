import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { Response } from 'express';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { buildMeta } from '../common/utils/pagination.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  Airline,
  AirlineDocument,
} from '../airlines/schemas/airline.schema.js';
import { CreateFlightDto } from './dto/create-flight.dto.js';
import { UpdateFlightDto } from './dto/update-flight.dto.js';
import { CreateCabinDto } from './dto/create-cabin.dto.js';
import { UpdateCabinDto } from './dto/update-cabin.dto.js';
import { SearchFlightsDto } from './dto/search-flights.dto.js';
import { FlightCancellationHooks } from './flight-cancellation.hooks.js';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema.js';
import type { FlightBookingDocument } from '../flight-bookings/schemas/flight-booking.schema.js';
import { FlightBookingStatus } from '../flight-bookings/flight-booking.enums.js';
import {
  PASSENGER_EXPORT_COLUMNS,
  toModeratorBookingView,
  toPassengerExportRows,
} from '../flight-bookings/domain/booking-views.js';

/** FLT-29: moderators only see bookings that were really made (review A4). */
const MODERATOR_VISIBLE_STATUSES = [
  FlightBookingStatus.CONFIRMED,
  FlightBookingStatus.CANCELLED,
];
import {
  CabinClass,
  Flight,
  FlightDocument,
  FlightStatus,
} from './schemas/flight.schema.js';

@Injectable()
export class FlightsService {
  constructor(
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
    // Typed FlightBooking model instead of reading 'flightbookings' by name (review D2/A4).
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBookingDocument>,
    // FLT-06: lets flight bookings react to a cancelled flight. Joumana Hozayen (review A3).
    @Optional()
    private readonly cancellationHooks?: FlightCancellationHooks,
  ) {}

  async create(dto: CreateFlightDto, user: AuthUser) {
    const airline = await this.airlineForModerator(dto.airlineId, user);
    if (!airline.isActive)
      throw new ConflictException('Cannot add flights to an inactive airline');
    this.validateRouteAndTimes(
      dto.departureAirportId,
      dto.arrivalAirportId,
      dto.departureTime,
      dto.arrivalTime,
    );
    this.validateCabinClasses(dto.cabins.map(({ cabinClass }) => cabinClass));

    try {
      return await new this.flightModel({
        airlineId: dto.airlineId,
        flightNumber: dto.flightNumber,
        departureAirportId: dto.departureAirportId,
        arrivalAirportId: dto.arrivalAirportId,
        departureTime: new Date(dto.departureTime),
        arrivalTime: new Date(dto.arrivalTime),
        cabins: dto.cabins.map((cabin) => ({
          cabinClass: cabin.cabinClass,
          capacity: cabin.capacity,
          availableSeats: cabin.capacity,
          price: cabin.price,
          currency: cabin.currency ?? 'USD',
        })),
      }).save();
    } catch (error) {
      this.rethrowDuplicateKey(error);
    }
  }

  async findOne(id: string) {
    const flight = await this.findFlight(id);
    return this.flightModel.populate(flight, { path: 'airlineId' });
  }

  async update(id: string, dto: UpdateFlightDto, user: AuthUser) {
    const flight = await this.findFlight(id);
    await this.assertFlightOwner(flight, user);
    if (flight.status === FlightStatus.Cancelled) {
      throw new ConflictException('Cancelled flights cannot be updated');
    }
    if (dto.airlineId && dto.airlineId !== String(flight.airlineId)) {
      const airline = await this.airlineForModerator(dto.airlineId, user);
      if (!airline.isActive)
        throw new ConflictException(
          'Cannot move a flight to an inactive airline',
        );
    }

    const departureAirportId =
      dto.departureAirportId ?? String(flight.departureAirportId);
    const arrivalAirportId =
      dto.arrivalAirportId ?? String(flight.arrivalAirportId);
    const departureTime =
      dto.departureTime ?? flight.departureTime.toISOString();
    const arrivalTime = dto.arrivalTime ?? flight.arrivalTime.toISOString();
    this.validateRouteAndTimes(
      departureAirportId,
      arrivalAirportId,
      departureTime,
      arrivalTime,
    );
    const update: Record<string, unknown> = {};
    if (dto.airlineId !== undefined) update.airlineId = dto.airlineId;
    if (dto.flightNumber !== undefined) update.flightNumber = dto.flightNumber;
    if (dto.departureAirportId !== undefined)
      update.departureAirportId = dto.departureAirportId;
    if (dto.arrivalAirportId !== undefined)
      update.arrivalAirportId = dto.arrivalAirportId;
    if (dto.departureTime !== undefined)
      update.departureTime = new Date(dto.departureTime);
    if (dto.arrivalTime !== undefined)
      update.arrivalTime = new Date(dto.arrivalTime);
    let updated;
    try {
      updated = await this.flightModel
        .findByIdAndUpdate(
          id,
          { $set: update },
          { new: true, runValidators: true },
        )
        .lean();
    } catch (error) {
      this.rethrowDuplicateKey(error);
    }
    if (!updated) throw new NotFoundException('Flight not found');
    return updated;
  }

  async cancel(id: string, user: AuthUser) {
    const flight = await this.findFlight(id);
    await this.assertFlightOwner(flight, user);
    if (flight.status === FlightStatus.Cancelled) return flight;
    if (flight.status === FlightStatus.Completed) {
      throw new ConflictException('Completed flights cannot be cancelled');
    }
    const cancelled = await this.flightModel.findByIdAndUpdate(
      id,
      { $set: { status: FlightStatus.Cancelled } },
      { new: true },
    );
    // FLT-06: release holds, cancel confirmed bookings with a full refund and notify
    // passengers. Added by Joumana Hozayen (review A3).
    await this.cancellationHooks?.notifyCancelled(id);
    return cancelled;
  }

  async addCabin(id: string, dto: CreateCabinDto, user: AuthUser) {
    const flight = await this.findFlight(id);
    await this.assertFlightOwner(flight, user);
    this.assertScheduled(flight);
    const updated = await this.flightModel.findOneAndUpdate(
      { _id: id, 'cabins.cabinClass': { $ne: dto.cabinClass } },
      {
        $push: {
          cabins: {
            _id: new Types.ObjectId(),
            cabinClass: dto.cabinClass,
            capacity: dto.capacity,
            availableSeats: dto.capacity,
            price: dto.price,
            currency: dto.currency ?? 'USD',
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated)
      throw new ConflictException(
        'This cabin class already exists on the flight',
      );
    return updated;
  }

  async updateCabin(
    id: string,
    cabinId: string,
    dto: UpdateCabinDto,
    user: AuthUser,
  ) {
    const flight = await this.findFlight(id);
    await this.assertFlightOwner(flight, user);
    this.assertScheduled(flight);
    const cabinIndex = flight.cabins.findIndex(
      (cabin) => String(cabin._id) === cabinId,
    );
    if (cabinIndex < 0) throw new NotFoundException('Cabin not found');
    if (
      dto.cabinClass &&
      flight.cabins.some(
        (cabin, index) =>
          index !== cabinIndex && cabin.cabinClass === dto.cabinClass,
      )
    ) {
      throw new ConflictException(
        'This cabin class already exists on the flight',
      );
    }

    const cabin = flight.cabins[cabinIndex];
    const soldSeats = cabin.capacity - cabin.availableSeats;
    const capacity = dto.capacity ?? cabin.capacity;
    if (capacity < soldSeats) {
      throw new ConflictException(
        'Cabin capacity cannot be less than the number of seats already sold',
      );
    }
    const update: Record<string, unknown> = {
      'cabins.$.capacity': capacity,
      'cabins.$.availableSeats': capacity - soldSeats,
    };
    if (dto.cabinClass !== undefined)
      update['cabins.$.cabinClass'] = dto.cabinClass;
    if (dto.price !== undefined) update['cabins.$.price'] = dto.price;
    if (dto.currency !== undefined) update['cabins.$.currency'] = dto.currency;
    const updated = await this.flightModel.findOneAndUpdate(
      {
        _id: id,
        cabins: {
          $elemMatch: {
            _id: cabin._id,
            capacity: cabin.capacity,
            availableSeats: cabin.availableSeats,
          },
        },
      },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!updated)
      throw new ConflictException('Cabin inventory changed; reload and retry');
    return updated;
  }

  async search(dto: SearchFlightsDto) {
    if (
      dto.minPrice !== undefined &&
      dto.maxPrice !== undefined &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new BadRequestException('minPrice must not exceed maxPrice');
    }
    if (dto.departureAirportId === dto.arrivalAirportId) {
      throw new BadRequestException(
        'Departure and arrival airports must be different',
      );
    }
    const hasPassengerBreakdown =
      dto.adultCount !== undefined ||
      dto.childCount !== undefined ||
      dto.infantCount !== undefined;
    if (dto.adultCount === 0)
      throw new BadRequestException('At least one adult passenger is required');
    const passengerCount = hasPassengerBreakdown
      ? (dto.adultCount ?? 1) + (dto.childCount ?? 0) + (dto.infantCount ?? 0)
      : dto.passengers;
    if (passengerCount > 9)
      throw new BadRequestException('Passenger count cannot exceed 9');
    if (dto.returnDate && !dto.departureDate) {
      throw new BadRequestException(
        'A departure date is required for round-trip search',
      );
    }
    if (
      dto.returnDate &&
      dto.departureDate &&
      dto.returnDate < dto.departureDate
    ) {
      throw new BadRequestException(
        'Return date cannot be before departure date',
      );
    }

    const activeAirlines = await this.airlineModel
      .find({ isActive: true })
      .distinct('_id');
    const outbound = await this.searchLeg(
      dto,
      dto.departureAirportId,
      dto.arrivalAirportId,
      dto.departureDate,
      dto.departureTimeZone,
      passengerCount,
      activeAirlines,
    );
    if (!dto.returnDate) {
      return {
        data: outbound.data,
        meta: buildMeta(outbound.total, dto.page, dto.limit),
      };
    }

    const inbound = await this.searchLeg(
      dto,
      dto.arrivalAirportId,
      dto.departureAirportId,
      dto.returnDate,
      dto.returnTimeZone,
      passengerCount,
      activeAirlines,
    );
    return {
      data: outbound.data,
      meta: buildMeta(outbound.total, dto.page, dto.limit),
      returnFlights: inbound.data,
      returnMeta: buildMeta(inbound.total, dto.page, dto.limit),
    };
  }

  async reserveSeats(flightId: string, cabinId: string, count: number) {
    if (
      !isValidObjectId(flightId) ||
      !isValidObjectId(cabinId) ||
      !Number.isInteger(count) ||
      count < 1
    ) {
      throw new BadRequestException(
        'Flight, cabin, and seat count are invalid',
      );
    }
    const flight = await this.flightModel
      .findById(flightId)
      .select('airlineId')
      .lean();
    if (!flight) throw new NotFoundException('Flight not found');
    const airline = await this.airlineModel
      .findOne({ _id: flight.airlineId, isActive: true })
      .select('_id')
      .lean();
    if (!airline)
      throw new ConflictException(
        'Bookings are not available for an inactive airline',
      );
    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          _id: flightId,
          status: FlightStatus.Scheduled,
          cabins: {
            $elemMatch: { _id: cabinId, availableSeats: { $gte: count } },
          },
        },
        { $inc: { 'cabins.$.availableSeats': -count } },
        { new: true },
      )
      .lean();
    if (updated) return updated;

    const flightWithCabin = await this.flightModel.findById(flightId).lean();
    if (!flightWithCabin) throw new NotFoundException('Flight not found');
    const unavailableCabin = flightWithCabin.cabins.find(
      (cabin) => String(cabin._id) === cabinId,
    );
    if (!unavailableCabin) throw new NotFoundException('Cabin not found');
    if (flightWithCabin.status !== FlightStatus.Scheduled) {
      throw new ConflictException('Flight is not available for booking');
    }
    if (unavailableCabin.availableSeats >= count) {
      throw new ConflictException(
        'Inventory changed while reserving seats; retry the operation',
      );
    }
    throw new ConflictException('Not enough seats are available');
  }

  /**
   * FLT-29: bookings on this flight for its airline moderator (or an admin).
   * Matches return legs too (segments.flightId), lists only Confirmed and Cancelled
   * bookings, and returns names, cabin, seats and status only, never passport numbers,
   * emails or phones. Updated by Joumana Hozayen (review A4).
   */
  async bookings(id: string, user: AuthUser, query: PaginationQueryDto) {
    const flight = await this.findFlight(id);
    await this.assertFlightOwner(flight, user);
    const filter = this.moderatorBookingFilter(id);
    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);
    const data = bookings.map((b) => toModeratorBookingView(b, id));
    return { data, meta: buildMeta(total, query.page, query.limit) };
  }

  /** FLT-29: passenger CSV with booking reference, status, cabin and seats (review A4). */
  async exportPassengers(id: string, user: AuthUser, response: Response) {
    const flight = await this.findFlight(id);
    await this.assertFlightOwner(flight, user);
    const bookings = await this.bookingModel
      .find(this.moderatorBookingFilter(id))
      .sort({ createdAt: 1 })
      .lean();
    const rows = bookings.flatMap((b) => toPassengerExportRows(b, id));
    const csv = [
      PASSENGER_EXPORT_COLUMNS.join(','),
      ...rows.map((row) =>
        PASSENGER_EXPORT_COLUMNS.map((column) =>
          this.csvCell(row[column]),
        ).join(','),
      ),
    ].join('\r\n');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="flight-${id}-passengers.csv"`,
    );
    response.send(csv);
  }

  private moderatorBookingFilter(flightId: string) {
    return {
      'segments.flightId': new Types.ObjectId(flightId),
      status: { $in: MODERATOR_VISIBLE_STATUSES },
    };
  }

  private async searchLeg(
    dto: SearchFlightsDto,
    departureAirportId: string,
    arrivalAirportId: string,
    localDate: string | undefined,
    timeZone: string | undefined,
    passengerCount: number,
    activeAirlines: Types.ObjectId[],
  ) {
    const cabinFilter: Record<string, unknown> = {
      availableSeats: { $gte: passengerCount },
    };
    if (dto.cabinClass) cabinFilter.cabinClass = dto.cabinClass;
    const filter: Record<string, unknown> = {
      airlineId: { $in: activeAirlines },
      departureAirportId,
      arrivalAirportId,
      status: FlightStatus.Scheduled,
      departureTime: { $gte: new Date() },
      cabins: { $elemMatch: cabinFilter },
    };
    if (localDate) {
      if (!timeZone)
        throw new BadRequestException(
          'A time zone is required with each travel date',
        );
      const [start, end] = this.localDayRange(localDate, timeZone);
      filter.departureTime = {
        $gte: new Date(Math.max(start.getTime(), Date.now())),
        $lt: end,
      };
    }
    const flights = await this.flightModel.find(filter).lean();
    const matching = flights
      .map((flight) => {
        const cabins = flight.cabins.filter(
          (cabin) =>
            cabin.availableSeats >= passengerCount &&
            (!dto.cabinClass || cabin.cabinClass === dto.cabinClass) &&
            (dto.minPrice === undefined || cabin.price >= dto.minPrice) &&
            (dto.maxPrice === undefined || cabin.price <= dto.maxPrice),
        );
        return Object.assign({}, flight, {
          cabins,
          lowestPrice: Math.min(...cabins.map((cabin) => cabin.price)),
        });
      })
      .filter((flight) => flight.cabins.length > 0)
      .sort((left, right) => {
        const compare =
          dto.sortBy === 'price'
            ? left.lowestPrice - right.lowestPrice
            : left.departureTime.getTime() - right.departureTime.getTime();
        return dto.order === 'desc' ? -compare : compare;
      });
    const start = (dto.page - 1) * dto.limit;
    return {
      data: matching.slice(start, start + dto.limit),
      total: matching.length,
    };
  }

  private localDayRange(date: string, timeZone: string): [Date, Date] {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match)
      throw new BadRequestException('Travel dates must use YYYY-MM-DD format');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const requestedDate = new Date(Date.UTC(year, month - 1, day));
    if (
      requestedDate.getUTCFullYear() !== year ||
      requestedDate.getUTCMonth() !== month - 1 ||
      requestedDate.getUTCDate() !== day
    ) {
      throw new BadRequestException('Travel date is not a valid calendar date');
    }
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const first = this.localMidnightUtc(year, month, day, timeZone);
    const second = this.localMidnightUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      timeZone,
    );
    return [first, second];
  }

  private localMidnightUtc(
    year: number,
    month: number,
    day: number,
    timeZone: string,
  ): Date {
    const target = Date.UTC(year, month - 1, day);
    let instant = target;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = Object.fromEntries(
          formatter
            .formatToParts(new Date(instant))
            .map(({ type, value }) => [type, value]),
        );
        const represented = Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day),
          Number(parts.hour),
          Number(parts.minute),
          Number(parts.second),
        );
        instant += target - represented;
      }
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException('Invalid IANA time zone');
      throw error;
    }
    return new Date(instant);
  }

  private async findFlight(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Flight not found');
    const flight = await this.flightModel.findById(id);
    if (!flight) throw new NotFoundException('Flight not found');
    return flight;
  }

  private async airlineForModerator(id: string, user: AuthUser) {
    if (!isValidObjectId(id)) throw new NotFoundException('Airline not found');
    if (user.role !== Role.Admin && user.assignedProvider?.providerId !== id) {
      throw new ForbiddenException('You can only manage your assigned airline');
    }
    const airline = await this.airlineModel.findById(id);
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  private async assertFlightOwner(flight: FlightDocument, user: AuthUser) {
    const airlineId = String(flight.airlineId);
    if (
      user.role !== Role.Admin &&
      user.assignedProvider?.providerId !== airlineId
    ) {
      throw new ForbiddenException(
        'You can only manage flights for your assigned airline',
      );
    }
  }

  private assertScheduled(flight: FlightDocument) {
    if (flight.status !== FlightStatus.Scheduled) {
      throw new ConflictException('Only scheduled flights can be changed');
    }
  }

  private rethrowDuplicateKey(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException(
        'Flight number already exists for this airline',
      );
    }
    throw error;
  }

  private validateRouteAndTimes(
    departureAirportId: string,
    arrivalAirportId: string,
    departureTime: string,
    arrivalTime: string,
  ) {
    if (
      !isValidObjectId(departureAirportId) ||
      !isValidObjectId(arrivalAirportId)
    ) {
      throw new BadRequestException('Airport IDs must be valid MongoDB IDs');
    }
    if (departureAirportId === arrivalAirportId) {
      throw new BadRequestException(
        'Departure and arrival airports must be different',
      );
    }
    if (new Date(arrivalTime).getTime() <= new Date(departureTime).getTime()) {
      throw new BadRequestException(
        'Arrival time must be after departure time',
      );
    }
  }

  private validateCabinClasses(classes: CabinClass[]) {
    if (new Set(classes).size !== classes.length) {
      throw new BadRequestException(
        'Each cabin class can only be listed once per flight',
      );
    }
  }

  private csvCell(value: unknown) {
    const text = typeof value === 'string' ? value : '';
    const safeValue = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeValue.replaceAll('"', '""')}"`;
  }
}
