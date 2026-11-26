import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { buildMeta } from '../common/utils/pagination.js';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema.js';
import type { FlightBookingDocument } from '../flight-bookings/schemas/flight-booking.schema.js';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema.js';
import type { HotelBookingDocument } from '../hotel-bookings/schemas/hotel-booking.schema.js';
import { BookingType } from '../payments/enums/payment.enums.js';
import { ListAdminBookingsQueryDto } from './dto/list-admin-bookings.query.dto.js';

@Injectable()
export class AdminBookingsService {
  constructor(
    @InjectModel(FlightBooking.name)
    private readonly flightBookingModel: Model<FlightBookingDocument>,
    @InjectModel(HotelBooking.name)
    private readonly hotelBookingModel: Model<HotelBookingDocument>,
  ) {}

  async listBookings(q: ListAdminBookingsQueryDto) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.userId) filter.userId = new Types.ObjectId(q.userId);

    if (q.fromDate || q.toDate) {
      const createdAt: Record<string, Date> = {};
      if (q.fromDate) createdAt.$gte = new Date(q.fromDate);
      if (q.toDate) {
        const end = new Date(q.toDate);
        if (q.toDate.length <= 10) end.setUTCHours(23, 59, 59, 999);
        createdAt.$lte = end;
      }
      if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
        throw new BadRequestException('fromDate must be before or equal to toDate');
      }
      filter.createdAt = createdAt;
    }

    const includeFlights = !q.type || q.type === BookingType.Flight;
    const includeHotels = !q.type || q.type === BookingType.Hotel;

    const [flights, hotels] = await Promise.all([
      includeFlights ? this.flightBookingModel.find(filter).sort({ createdAt: -1 }).lean() : [],
      includeHotels ? this.hotelBookingModel.find(filter).sort({ createdAt: -1 }).lean() : [],
    ]);

    const combined = [
      ...flights.map((f) => ({
        id: String(f._id),
        bookingType: BookingType.Flight,
        reference: f.bookingReference ?? null,
        userId: String(f.userId),
        provider: f.segments?.[0]?.airlineId ? String(f.segments[0].airlineId) : null,
        dates: {
          departureAt: f.segments?.[0]?.departureAt ?? null,
          arrivalAt: f.segments?.[f.segments.length - 1]?.arrivalAt ?? null,
        },
        amount: f.totalPrice,
        currency: f.currency,
        status: f.status,
        paymentId: f.paymentId ?? null,
        policyAcceptedAt: f.policyAcceptedAt ?? null,
        createdAt: f.createdAt ?? new Date(0),
        updatedAt: f.updatedAt ?? new Date(0),
      })),
      ...hotels.map((h) => ({
        id: String(h._id),
        bookingType: BookingType.Hotel,
        reference: (h as { bookingReference?: string }).bookingReference ?? String(h._id),
        userId: String(h.userId),
        provider: String(h.hotelId),
        dates: {
          checkIn: h.checkIn,
          checkOut: h.checkOut,
        },
        amount: h.totalPrice,
        currency: h.currency,
        status: h.status,
        paymentId: h.paymentId ? String(h.paymentId) : null,
        policyAcceptedAt: h.policyAcceptedAt ?? null,
        createdAt: h.createdAt ?? new Date(0),
        updatedAt: h.updatedAt ?? new Date(0),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = combined.length;
    const start = (q.page - 1) * q.limit;
    const data = combined.slice(start, start + q.limit);

    return {
      data,
      meta: buildMeta(total, q.page, q.limit),
    };
  }
}
