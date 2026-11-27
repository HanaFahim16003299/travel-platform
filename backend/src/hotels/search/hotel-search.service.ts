import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hotel, HotelDocument } from '../schemas/hotel.schema.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { QuerySearchHotelsDto } from '../dto/search-hotels.dto.js';
import { DestinationsService } from '../destinations/destinations.service.js';
import { assertNotInPast, getNightsBetween } from '../utils/date-range.util.js';
import { summarizeFreeRooms } from '../utils/free-rooms.util.js';
import { buildMeta } from '../../common/utils/pagination.js';

@Injectable()
export class HotelSearchService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    private readonly availabilityService: AvailabilityService,
    // Added by Mohamed Hesham: HTL-11, finds the cities of a destination name.
    private readonly destinations: DestinationsService,
  ) {}

  // HTL-11 / HTL-12: active hotels with enough free rooms for the stay,
  // filtered by price / rating and sorted, paginated per GEN-05
  async search(query: QuerySearchHotelsDto) {
    const {
      cityId,
      destination,
      startDate,
      endDate,
      guests,
      rooms: roomCount,
      minPrice,
      maxPrice,
      minRating,
      sort,
      order,
      page,
      limit,
    } = query;

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }

    // Changed by Mohamed Hesham: HTL-11, send a destination name or a city id
    if (Boolean(cityId) === Boolean(destination)) {
      throw new BadRequestException('Send either destination or cityId');
    }

    // checks endDate > startDate and that check-in is not in the past
    const nights = getNightsBetween(startDate, endDate);
    assertNotInPast(nights[0]);

    const cityIds = cityId
      ? [new Types.ObjectId(cityId)]
      : await this.destinations.findCityIds(destination as string);
    if (cityIds.length === 0) {
      return { data: [], meta: buildMeta(0, page, limit) };
    }

    const hotelFilter: Record<string, unknown> = {
      cityId: { $in: cityIds },
      isActive: true,
    };
    if (minRating !== undefined) {
      // unrated hotels (no reviews) never match a rating filter
      hotelFilter.reviewCount = { $gt: 0 };
      hotelFilter.averageRating = { $gte: minRating };
    }

    const hotels = await this.hotelModel.find(hotelFilter).lean();
    if (hotels.length === 0) {
      return { data: [], meta: buildMeta(0, page, limit) };
    }

    const roomsByHotel = await this.availabilityService.findFreeRoomsByHotel(
      hotels.map((hotel) => hotel._id),
      startDate,
      endDate,
    );

    const results = hotels
      .map((hotel) => {
        const freeRooms = roomsByHotel.get(hotel._id.toString()) ?? [];
        const summary = summarizeFreeRooms(freeRooms, guests, roomCount);
        if (!summary) return null;
        if (minPrice !== undefined && summary.minPrice < minPrice) return null;
        if (maxPrice !== undefined && summary.minPrice > maxPrice) return null;

        return {
          hotelId: hotel._id,
          name: hotel.name,
          address: hotel.address,
          cityId: hotel.cityId,
          starRating: hotel.starRating,
          averageRating: hotel.averageRating,
          reviewCount: hotel.reviewCount,
          amenities: hotel.amenities,
          images: hotel.images,
          checkInTime: hotel.checkInTime,
          checkOutTime: hotel.checkOutTime,
          minPricePerNight: summary.minPrice,
          freeRooms: summary.freeRooms,
        };
      })
      .filter((hotel): hotel is NonNullable<typeof hotel> => hotel !== null);

    const direction = order === 'desc' ? -1 : 1;
    const sortKey = sort === 'rating' ? 'averageRating' : 'minPricePerNight';
    results.sort((a, b) => {
      if (a[sortKey] !== b[sortKey])
        return (a[sortKey] - b[sortKey]) * direction;
      // stable tie-break so pagination is deterministic
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.hotelId.toString() < b.hotelId.toString() ? -1 : 1;
    });

    const total = results.length;
    const start = (page - 1) * limit;

    return {
      data: results.slice(start, start + limit),
      meta: buildMeta(total, page, limit),
    };
  }
}
