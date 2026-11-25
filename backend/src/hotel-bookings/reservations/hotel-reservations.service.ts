import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  HotelBooking,
  HotelBookingDocument,
} from '../schemas/hotel-booking.schema.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { QueryHotelReservationsDto } from '../dto/query-hotel-reservations.dto.js';
import { buildMeta } from '../../common/utils/pagination.js';

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

@Injectable()
export class HotelReservationsService {
  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBookingDocument>,
  ) {}

  // HTL-22: a hotel moderator views the reservations of their own hotel.
  // Ownership is enforced by @ProviderScope on the controller.
  async findForHotel(hotelId: string, query: QueryHotelReservationsDto) {
    if (!OBJECT_ID.test(hotelId)) {
      throw new BadRequestException('Invalid hotel ID');
    }

    const { page = 1, limit = 10, status } = query;

    // Expired holds are unpaid noise, so they are hidden unless asked for.
    const filter = {
      hotelId,
      status: status ?? { $ne: BookingStatus.Expired },
    };

    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .select(
          'userId rooms checkIn checkOut nights guests totalPrice status confirmedAt createdAt',
        )
        .populate('userId', 'firstName lastName')
        .sort({ checkIn: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.bookingModel.countDocuments(filter),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }
}
