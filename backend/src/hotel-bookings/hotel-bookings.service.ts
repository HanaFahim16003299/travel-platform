import { randomBytes } from 'node:crypto';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { BookingGatewayRegistry } from '../payments/booking-gateway.registry.js';
import { BookingType, RefundStatus } from '../payments/enums/payment.enums.js';
import { PaymentsService } from '../payments/payments.service.js';
import { RefundsService } from '../payments/refunds.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';

import {
  InjectModel,
  InjectConnection,
} from '@nestjs/mongoose';

import type { Model, Connection, ClientSession } from 'mongoose';
import { Types } from 'mongoose';

import {
  HotelBooking,
  HotelBookingDocument,
} from './schemas/hotel-booking.schema.js';

import {
  Hotel,
  HotelDocument,
} from '../hotels/schemas/hotel.schema.js';

import {
  Room,
  RoomDocument,
} from '../hotels/schemas/room.schema.js';

import {
  RoomAvailability,
  RoomAvailabilityDocument,
} from '../hotels/schemas/room-availability.schema.js';

import {
  getNightsBetween,
  assertNotInPast,
} from '../hotels/utils/date-range.util.js';

import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';
import { BookingStatus } from './enums/booking-status.enum.js';

import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { buildMeta } from '../common/utils/pagination.js';

// Added by Mohamed Hesham: booking reference (HTL-17): 6 characters, no 0/O or 1/I so it is easy to read out loud.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 6;
const MAX_REFERENCE_ATTEMPTS = 5;

@Injectable()
export class HotelBookingsService implements OnModuleInit {
  // Placeholder until confirmed against Excel requirements
  private readonly holdDurationMinutes = 15;

  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBookingDocument>,

    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<HotelDocument>,

    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,

    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel:
      Model<RoomAvailabilityDocument>,

    @InjectConnection()
    private readonly connection: Connection,

    @Optional() private readonly paymentsService?: PaymentsService,
    @Optional() private readonly refundsService?: RefundsService,
    @Optional() private readonly gatewayRegistry?: BookingGatewayRegistry,
  ) {}

  onModuleInit() {
    this.gatewayRegistry?.register(BookingType.Hotel, {
      getPolicies: (user, id) => this.getPolicies(user, id),
      acceptPolicies: (user, id) => this.acceptPolicies(user, id),
      getPayableBooking: (id) => this.getPayableBooking(id),
      confirmAfterPayment: async (id, paymentId) => {
        try {
          await this.confirmBooking(id, paymentId);
          return true;
        } catch {
          return false;
        }
      },
      expireIfDue: async (id) => {
        await this.expireBooking(id);
      },
    });
  }

  // ==========================================
  // HTL-16, HTL-18: CREATE HOTEL BOOKING
  // ==========================================

  async create(userId: string, dto: CreateHotelBookingDto) {
    const userObjectId = this.validateId(userId, 'user');
    const hotelId = this.validateId(dto.hotelId, 'hotel');

    // Validate booking dates
    const checkIn = this.parseDate(dto.checkIn);
    const checkOut = this.parseDate(dto.checkOut);

    const nights = getNightsBetween(checkIn, checkOut);

    assertNotInPast(nights[0]);

    // Validate selected rooms
    if (!Array.isArray(dto.roomIds) || dto.roomIds.length === 0) {
      throw new BadRequestException(
        'At least one room must be selected',
      );
    }

    // Validate and normalize room IDs
    const roomIds = dto.roomIds.map((id) =>
      this.validateId(id, 'room'),
    );

    // Prevent duplicate room selection
    if (new Set(roomIds).size !== roomIds.length) {
      throw new BadRequestException(
        'Duplicate room IDs are not allowed',
      );
    }

    // Validate number of guests
    if (!Number.isInteger(dto.guests) || dto.guests < 1) {
      throw new BadRequestException(
        'Number of guests must be a positive integer',
      );
    }

    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        // Check that the hotel exists and is active
        const hotel = await this.hotelModel
          .findOne({
            _id: hotelId,
            isActive: true,
          })
          .session(session);

        if (!hotel) {
          throw new NotFoundException(
            'Hotel not found or inactive',
          );
        }

        // Find selected rooms
        const rooms = await this.roomModel
          .find({
            _id: { $in: roomIds },
            hotelId,
            isActive: true,
          })
          .session(session);

        // Verify that every selected room is valid
        if (rooms.length !== roomIds.length) {
          throw new BadRequestException(
            'One or more selected rooms are invalid or inactive',
          );
        }

        // Calculate total room capacity
        const totalCapacity = rooms.reduce(
          (sum, room) =>
            sum + room.maxAdults + room.maxChildren,
          0,
        );

        if (dto.guests > totalCapacity) {
          throw new BadRequestException(
            'Selected rooms do not have enough capacity',
          );
        }

        // Calculate total price using integer cents
        const nightlyPriceInCents = rooms.reduce(
          (sum, room) =>
            sum + Math.round(room.pricePerNight * 100),
          0,
        );

        const totalPriceInCents =
          nightlyPriceInCents * nights.length;

        if (
          !Number.isSafeInteger(totalPriceInCents) ||
          totalPriceInCents <= 0
        ) {
          throw new BadRequestException(
            'Invalid booking price',
          );
        }

        const totalPrice = totalPriceInCents / 100;

        // Calculate booking expiration deadline
        const expiresAt = new Date(
          Date.now() +
            this.holdDurationMinutes * 60 * 1000,
        );

        // Construct booking document
        // Mongoose automatically generates its ObjectId
        const booking = new this.bookingModel({
          userId: userObjectId,
          hotelId,

          rooms: rooms.map((room) => ({
            roomId: room._id,
            roomName: room.name,
            pricePerNight: room.pricePerNight,
          })),

          checkIn,
          checkOut,
          nights: nights.length,
          guests: dto.guests,

          totalPrice,
          currency: 'USD',

          policies: hotel.policies,

          status: BookingStatus.PendingPayment,

          expiresAt,
          expiredAt: null,

          paymentId: null,
          policyAcceptedAt: null,

          confirmedAt: null,
          cancelledAt: null,

          refundAmount: 0,
          refundPercent: 0,
          refundStatus: 'Not Required',
          refundRequestedAt: null,
        });

        // Calculate the number of required room-night records
        const expectedRecords =
          roomIds.length * nights.length;

        // Atomically reserve every selected room-night
        const result = await this.availabilityModel.updateMany(
          {
            hotelId,
            roomId: { $in: roomIds },
            date: { $in: nights },
            isBlocked: false,
            bookingId: null,
          },
          {
            $set: {
              bookingId: booking._id,
            },
          },
          {
            session,
          },
        );

        // Abort the entire transaction if any night is unavailable
        if (result.modifiedCount !== expectedRecords) {
          throw new ConflictException(
            'One or more selected rooms are unavailable for the requested dates',
          );
        }

        // Save booking inside the same transaction
        return await booking.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  // ==========================================
  // HTL-20: LIST USER BOOKINGS
  // ==========================================

  async findAll(
    userId: string,
    query: PaginationQueryDto,
  ) {
    const userObjectId = this.validateId(userId, 'user');

    const {
      page = 1,
      limit = 10,
      sort,
      order,
    } = query;

    // Validate pagination
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'Invalid pagination parameters',
      );
    }

    // Restrict sorting to valid booking fields
    const allowedSortFields = [
      'createdAt',
      'checkIn',
      'checkOut',
      'totalPrice',
      'status',
    ];

    if (sort && !allowedSortFields.includes(sort)) {
      throw new BadRequestException(
        'Invalid sorting field',
      );
    }

    if (order && order !== 'asc' && order !== 'desc') {
      throw new BadRequestException(
        'Invalid sorting order',
      );
    }

    const sortField = sort ?? 'createdAt';

    const direction: 1 | -1 = sort
    ? (order === 'asc' ? 1 : -1)
    : -1;

    // Only retrieve bookings belonging to this user
    const filter = {
      userId: userObjectId,
    };

    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate('hotelId', 'name address images')
        .sort({
          [sortField]: direction,
          _id: direction,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.bookingModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: buildMeta(total, page, limit),
    };
  }

  // ==========================================
  // HTL-20: VIEW SPECIFIC BOOKING
  // ==========================================

  async findOne(
    userId: string,
    bookingId: string,
  ) {
    const userObjectId = this.validateId(userId, 'user');

    const bookingObjectId = this.validateId(
      bookingId,
      'booking',
    );

    const booking = await this.bookingModel
      .findOne({
        _id: bookingObjectId,
        userId: userObjectId,
      })
      .populate('hotelId', 'name address images')
      .lean();

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    return booking;
  }

  // ==========================================
  // HTL-21, PAY-03: CANCEL HOTEL BOOKING
  // ==========================================

  async cancel(
    userId: string,
    bookingId: string,
  ) {
    const userObjectId = this.validateId(userId, 'user');

    const bookingObjectId = this.validateId(
      bookingId,
      'booking',
    );

    const session = await this.connection.startSession();
    let result: {
      message: string;
      booking: HotelBookingDocument;
      refund: {
        required: boolean;
        amount: number;
        percent: number;
        currency: string;
        status: string;
        refundId?: string | null;
      };
    };

    try {
      result = await session.withTransaction(async () => {
        // Find booking and verify ownership
        const booking = await this.bookingModel
          .findOne({
            _id: bookingObjectId,
            userId: userObjectId,
          })
          .session(session);

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        // Prevent duplicate cancellations and refunds
        if (booking.status === BookingStatus.Cancelled) {
          return {
            message: 'Booking is already cancelled',
            booking,
            refund: {
              required: booking.refundAmount > 0,
              amount: booking.refundAmount,
              percent: booking.refundPercent,
              currency: booking.currency,
              status: booking.refundStatus,
            },
          };
        }

        // Expired bookings cannot be cancelled
        if (booking.status === BookingStatus.Expired) {
          throw new BadRequestException(
            'Expired bookings cannot be cancelled',
          );
        }

        // Only pending and confirmed bookings are eligible
        if (
          booking.status !== BookingStatus.PendingPayment &&
          booking.status !== BookingStatus.Confirmed
        ) {
          throw new BadRequestException(
            'This booking cannot be cancelled',
          );
        }

        const now = new Date();

        // Prevent cancellation after the stay starts
        // Exact cutoff must follow the Excel requirements
        if (now >= booking.checkIn) {
          throw new BadRequestException(
            'Bookings cannot be cancelled after check-in',
          );
        }

        const wasConfirmed =
          booking.status === BookingStatus.Confirmed;

        let refundAmount = 0;
        let refundPercent = 0;

        // Calculate refund for confirmed bookings
        if (wasConfirmed) {
          refundPercent = this.calculateRefundPercent(
            booking,
            now,
          );

          const totalPriceInCents = Math.round(
            booking.totalPrice * 100,
          );

          const refundInCents = Math.round(
            (totalPriceInCents * refundPercent) / 100,
          );

          refundAmount = refundInCents / 100;
        }

        // Update booking status
        booking.status = BookingStatus.Cancelled;
        booking.cancelledAt = now;

        // Persist refund request for payment integration
        booking.refundAmount = refundAmount;
        booking.refundPercent = refundPercent;

        booking.refundStatus =
          refundAmount > 0
            ? 'Pending'
            : 'Not Required';

        booking.refundRequestedAt =
          refundAmount > 0 ? now : null;

        await booking.save({ session });

        // Release all room-nights reserved by this booking
        await this.availabilityModel.updateMany(
          {
            bookingId: booking._id,
          },
          {
            $set: {
              bookingId: null,
            },
          },
          {
            session,
          },
        );

        return {
          message: 'Booking cancelled successfully',

          booking,

          refund: {
            required: refundAmount > 0,
            amount: refundAmount,
            percent: refundPercent,
            currency: booking.currency,
            status: booking.refundStatus,
            refundId: null as string | null,
          },
        };
      });
    } finally {
      await session.endSession();
    }

    if (
      result.refund.required &&
      result.message === 'Booking cancelled successfully' &&
      this.refundsService
    ) {
      const refundDoc = await this.refundsService.processRefundForBooking({
        bookingType: BookingType.Hotel,
        bookingId: String(result.booking._id),
        userId: String(result.booking.userId),
        amount: result.refund.amount,
        currency: result.refund.currency,
        reason: `Hotel cancellation policy (${result.refund.percent}% refund)`,
      });

      if (refundDoc) {
        const nextStatus =
          refundDoc.status === RefundStatus.Succeeded
            ? 'Refunded'
            : refundDoc.status === RefundStatus.Failed
              ? 'Failed'
              : 'Pending';
        await this.bookingModel.updateOne(
          { _id: result.booking._id },
          { $set: { refundStatus: nextStatus } },
        );
        result.booking.refundStatus = nextStatus;
        result.refund.status = nextStatus;
        result.refund.refundId = String(refundDoc._id);
      }
    }

    return result;
  }

  // ==========================================
  // INTERNAL: CONFIRM BOOKING AFTER PAYMENT
  // Only called by trusted payment service
  // ==========================================

  async confirmBooking(bookingId: string, paymentId?: string) {
    const bookingObjectId = this.validateId(
      bookingId,
      'booking',
    );

    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        const booking = await this.bookingModel
          .findById(bookingObjectId)
          .session(session);

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        // Prevent duplicate confirmation
        if (booking.status === BookingStatus.Confirmed) {
          return booking;
        }

        // Only pending bookings may be confirmed
        if (booking.status !== BookingStatus.PendingPayment) {
          throw new ConflictException(
            'Only pending bookings can be confirmed',
          );
        }

        // Verify expiration deadline
        if (
          !booking.expiresAt ||
          booking.expiresAt.getTime() <= Date.now()
        ) {
          throw new ConflictException(
            'Booking payment deadline has expired',
          );
        }

        // Ensure that policies were accepted before payment
        if (!booking.policyAcceptedAt) {
          throw new ConflictException(
            'Booking policies have not been accepted',
          );
        }

        // Verify the exact reserved room-night records
        const nights = getNightsBetween(
          booking.checkIn,
          booking.checkOut,
        );

        const roomIds = booking.rooms.map(
          (room) => room.roomId,
        );

        const expectedRecords =
          roomIds.length * nights.length;

        const reservedRecords =
          await this.availabilityModel
            .countDocuments({
              bookingId: booking._id,
              hotelId: booking.hotelId,
              roomId: { $in: roomIds },
              date: { $in: nights },
              isBlocked: false,
            })
            .session(session);

        if (reservedRecords !== expectedRecords) {
          throw new ConflictException(
            'Booking inventory is no longer available',
          );
        }

        // Confirm booking
        booking.status = BookingStatus.Confirmed;
        booking.confirmedAt = new Date();
        // Added by Mohamed Hesham: HTL-17 booking reference.
        booking.bookingReference =
          await this.generateUniqueReference(session);
        if (paymentId && Types.ObjectId.isValid(paymentId)) {
          booking.paymentId = new Types.ObjectId(paymentId);
        }

        return await booking.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  // ==========================================
  // INTERNAL: EXPIRE BOOKING AND RELEASE ROOMS
  // ==========================================

  async expireBooking(bookingId: string) {
    const bookingObjectId = this.validateId(
      bookingId,
      'booking',
    );

    const session = await this.connection.startSession();
    let expiredBooking: HotelBookingDocument;

    try {
      expiredBooking = await session.withTransaction(async () => {
        const booking = await this.bookingModel
          .findById(bookingObjectId)
          .session(session);

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        // Do not expire confirmed or cancelled bookings
        // Also makes repeated expiration requests safe
        if (booking.status !== BookingStatus.PendingPayment) {
          return booking;
        }

        const now = new Date();

        // Verify that the deadline has actually passed
        if (!booking.expiresAt) {
          throw new ConflictException(
            'Booking has no payment deadline',
          );
        }

        if (booking.expiresAt.getTime() > now.getTime()) {
          throw new ConflictException(
            'Booking payment deadline has not expired',
          );
        }

        // Update booking status
        booking.status = BookingStatus.Expired;
        booking.expiredAt = now;

        await booking.save({ session });

        // Release room inventory
        await this.availabilityModel.updateMany(
          {
            bookingId: booking._id,
          },
          {
            $set: {
              bookingId: null,
            },
          },
          {
            session,
          },
        );

        return booking;
      });
    } finally {
      await session.endSession();
    }

    await this.paymentsService?.cancelPendingPaymentForBooking(
      BookingType.Hotel,
      bookingId,
    );

    return expiredBooking;
  }

  // ==========================================
  // INTERNAL: POLICY DISPLAY & ACCEPTANCE (PAY-02)
  // ==========================================

  async getPolicies(user: AuthUser, bookingId: string) {
    const bookingObjectId = this.validateId(bookingId, 'booking');
    const booking = await this.bookingModel.findById(bookingObjectId).lean();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (String(booking.userId) !== user.id && user.role !== Role.Admin) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    const hotel = await this.hotelModel
      .findById(booking.hotelId)
      .select('name checkInTime checkOutTime')
      .lean();
    return {
      bookingType: 'hotel',
      bookingId: String(booking._id),
      status: booking.status,
      totalPrice: booking.totalPrice,
      currency: booking.currency,
      policyAcceptedAt: booking.policyAcceptedAt ?? null,
      checkInTime: hotel?.checkInTime ?? null,
      checkOutTime: hotel?.checkOutTime ?? null,
      policies: booking.policies,
    };
  }

  async acceptPolicies(user: AuthUser, bookingId: string) {
    const bookingObjectId = this.validateId(bookingId, 'booking');
    const booking = await this.bookingModel.findById(bookingObjectId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (String(booking.userId) !== user.id) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    if (booking.status !== BookingStatus.PendingPayment) {
      throw new ConflictException('Only pending bookings can accept policies');
    }
    if (!booking.expiresAt || booking.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Booking payment deadline has expired');
    }
    if (!booking.policyAcceptedAt) {
      booking.policyAcceptedAt = new Date();
      await booking.save();
    }
    return {
      bookingType: 'hotel',
      bookingId: String(booking._id),
      accepted: true,
      policyAcceptedAt: booking.policyAcceptedAt,
    };
  }

  async getPayableBooking(bookingId: string) {
    const bookingObjectId = this.validateId(bookingId, 'booking');
    const booking = await this.bookingModel.findById(bookingObjectId).lean();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (
      booking.status !== BookingStatus.PendingPayment ||
      !booking.expiresAt ||
      booking.expiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException('Booking is not awaiting payment or the hold has expired');
    }
    return {
      id: String(booking._id),
      userId: String(booking.userId),
      amount: booking.totalPrice,
      currency: booking.currency,
      holdExpiresAt: booking.expiresAt,
      policyAcceptedAt: booking.policyAcceptedAt ?? null,
    };
  }

  // ==========================================
  // HELPER: UNIQUE BOOKING REFERENCE (HTL-17), added by Mohamed Hesham
  // ==========================================

  private async generateUniqueReference(
    session: ClientSession,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const reference = Array.from(
        randomBytes(REFERENCE_LENGTH),
        (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length],
      ).join('');

      const taken = await this.bookingModel
        .exists({ bookingReference: reference })
        .session(session);

      if (!taken) return reference;
    }

    throw new InternalServerErrorException(
      'Could not generate a booking reference',
    );
  }

  // ==========================================
  // HELPER: CALCULATE REFUND PERCENTAGE
  // ==========================================

  private calculateRefundPercent(
    booking: HotelBookingDocument,
    cancellationDate: Date,
  ): number {
    const millisecondsPerDay =
      24 * 60 * 60 * 1000;

    // Calculate complete days before check-in
    const daysBeforeCheckIn = Math.floor(
      (
        booking.checkIn.getTime() -
        cancellationDate.getTime()
      ) / millisecondsPerDay,
    );

    // Use original policies stored in booking
    const tiers =
      booking.policies?.cancellationTiers ?? [];

    // Sort cancellation tiers from highest to lowest
    const sortedTiers = [...tiers].sort(
      (a, b) =>
        b.daysBeforeCheckIn - a.daysBeforeCheckIn,
    );

    // Find the applicable cancellation tier
    const applicableTier = sortedTiers.find(
      (tier) =>
        daysBeforeCheckIn >= tier.daysBeforeCheckIn,
    );

    const refundPercent =
      applicableTier?.refundPercent ?? 0;

    // Protect against invalid cancellation policy values
    if (
      !Number.isFinite(refundPercent) ||
      refundPercent < 0 ||
      refundPercent > 100
    ) {
      throw new ConflictException(
        'Invalid cancellation policy refund percentage',
      );
    }

    return refundPercent;
  }

  // ==========================================
  // HELPER: VALIDATE MONGODB ID
  // ==========================================

  private validateId(
    id: string,
    entity: string,
  ): string {
    if (
      typeof id !== 'string' ||
      !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
      throw new BadRequestException(
        `Invalid ${entity} ID`,
      );
    }

    // Mongoose automatically casts valid ID strings
    return id.toLowerCase();
  }

  // ==========================================
  // HELPER: VALIDATE AND PARSE DATE
  // ==========================================

  private parseDate(value: string): Date {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      throw new BadRequestException(
        'Dates must use YYYY-MM-DD format',
      );
    }

    const date = new Date(
      `${value}T00:00:00.000Z`,
    );

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        'Invalid booking date',
      );
    }

    return date;
  }
}
