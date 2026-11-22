import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HotelSearchService } from './hotel-search.service.js';
import type { QuerySearchHotelsDto } from '../dto/search-hotels.dto.js';

function hotelId(n: number) {
  return new Types.ObjectId(
    `507f1f77bcf86cd79943${String(n).padStart(4, '0')}`,
  );
}

interface Hotel {
  _id: Types.ObjectId;
  name: string;
  address: string;
  cityId: Types.ObjectId;
  starRating?: number;
  averageRating: number;
  reviewCount: number;
  amenities: string[];
  images: string[];
  checkInTime: string;
  checkOutTime: string;
}

function hotel(n: number, overrides: Partial<Hotel> = {}): Hotel {
  return {
    _id: hotelId(n),
    name: `Hotel ${n}`,
    address: '1 Main St',
    cityId: hotelId(1),
    averageRating: 4,
    reviewCount: 5,
    amenities: [],
    images: [],
    checkInTime: '14:00',
    checkOutTime: '12:00',
    ...overrides,
  };
}

interface FreeRoom {
  maxAdults: number;
  maxChildren: number;
  pricePerNight: number;
}

const baseQuery: QuerySearchHotelsDto = {
  cityId: hotelId(1).toString(),
  startDate: new Date('2026-12-01T00:00:00Z'),
  endDate: new Date('2026-12-04T00:00:00Z'), // 3 nights
  guests: 2,
  rooms: 1,
  page: 1,
  limit: 10,
  sort: 'price',
  order: 'asc',
} as QuerySearchHotelsDto;

describe('HotelSearchService (HTL-11/HTL-12, GEN-05)', () => {
  beforeEach(() => {
    // fixes "now" so tests stay deterministic regardless of the real date
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function build(hotels: Hotel[], roomsByHotelId: Record<string, FreeRoom[]>) {
    const hotelModel = {
      find: vi.fn((filter: Record<string, unknown>) => ({
        lean: async () =>
          hotels.filter((h) => {
            if (filter.reviewCount && !(h.reviewCount > 0)) return false;
            const ratingFilter = filter.averageRating as
              { $gte: number } | undefined;
            if (ratingFilter && !(h.averageRating >= ratingFilter.$gte))
              return false;
            return true;
          }),
      })),
    };
    const findFreeRoomsByHotel = vi.fn(async (hotelIds: Types.ObjectId[]) => {
      const map = new Map<string, FreeRoom[]>();
      for (const id of hotelIds) {
        map.set(id.toString(), roomsByHotelId[id.toString()] ?? []);
      }
      return map;
    });
    const availabilityService = { findFreeRoomsByHotel };
    const service = new HotelSearchService(
      hotelModel as never,
      availabilityService as never,
    );
    return { service, hotelModel, findFreeRoomsByHotel };
  }

  it('excludes a hotel whose free rooms cannot cover the guests', async () => {
    const hA = hotel(1);
    const hB = hotel(2);
    const { service } = build([hA, hB], {
      [hA._id.toString()]: [
        { maxAdults: 1, maxChildren: 0, pricePerNight: 50 },
      ], // capacity 1 < 2 guests
      [hB._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 60 },
      ], // capacity 2 >= 2 guests
    });

    const result = await service.search(baseQuery);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hotelId).toBe(hB._id);
  });

  it('applies the price filter inclusively on both ends', async () => {
    const hotels = [50, 100, 150].map((price, i) => hotel(10 + i));
    const roomsByHotelId: Record<string, FreeRoom[]> = {};
    hotels.forEach((h, i) => {
      roomsByHotelId[h._id.toString()] = [
        { maxAdults: 2, maxChildren: 0, pricePerNight: [50, 100, 150][i] },
      ];
    });
    const { service } = build(hotels, roomsByHotelId);

    const inclusive = await service.search({
      ...baseQuery,
      minPrice: 50,
      maxPrice: 150,
    });
    expect(
      inclusive.data.map((d) => d.minPricePerNight).sort((a, b) => a - b),
    ).toEqual([50, 100, 150]);

    const exclusiveEdges = await service.search({
      ...baseQuery,
      minPrice: 51,
      maxPrice: 149,
    });
    expect(exclusiveEdges.data).toHaveLength(1);
    expect(exclusiveEdges.data[0].minPricePerNight).toBe(100);
  });

  it('throws 400 when minPrice is greater than maxPrice', async () => {
    const { service } = build([], {});
    await expect(
      service.search({ ...baseQuery, minPrice: 200, maxPrice: 50 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('excludes unrated hotels when minRating is set, via a Mongo filter on reviewCount and averageRating', async () => {
    const unrated = hotel(20, { averageRating: 0, reviewCount: 0 });
    const rated = hotel(21, { averageRating: 4.5, reviewCount: 10 });
    const roomsByHotelId = {
      [unrated._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 80 },
      ],
      [rated._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 80 },
      ],
    };
    const { service, hotelModel } = build([unrated, rated], roomsByHotelId);

    const result = await service.search({ ...baseQuery, minRating: 4 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hotelId).toBe(rated._id);
    const filterUsed = hotelModel.find.mock.calls[0][0];
    expect(filterUsed.reviewCount).toEqual({ $gt: 0 });
    expect(filterUsed.averageRating).toEqual({ $gte: 4 });
  });

  it('sorts by price ascending and descending', async () => {
    const [cheap, mid, pricey] = [hotel(30), hotel(31), hotel(32)];
    const roomsByHotelId = {
      [cheap._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 50 },
      ],
      [mid._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 100 },
      ],
      [pricey._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 150 },
      ],
    };
    const { service } = build([cheap, mid, pricey], roomsByHotelId);

    const asc = await service.search({
      ...baseQuery,
      sort: 'price',
      order: 'asc',
    });
    expect(asc.data.map((d) => d.minPricePerNight)).toEqual([50, 100, 150]);

    const desc = await service.search({
      ...baseQuery,
      sort: 'price',
      order: 'desc',
    });
    expect(desc.data.map((d) => d.minPricePerNight)).toEqual([150, 100, 50]);
  });

  it('sorts by rating ascending and descending', async () => {
    const low = hotel(40, { averageRating: 3 });
    const mid = hotel(41, { averageRating: 4 });
    const high = hotel(42, { averageRating: 5 });
    const roomsByHotelId = {
      [low._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 80 },
      ],
      [mid._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 80 },
      ],
      [high._id.toString()]: [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 80 },
      ],
    };
    const { service } = build([low, mid, high], roomsByHotelId);

    const asc = await service.search({
      ...baseQuery,
      sort: 'rating',
      order: 'asc',
    });
    expect(asc.data.map((d) => d.averageRating)).toEqual([3, 4, 5]);

    const desc = await service.search({
      ...baseQuery,
      sort: 'rating',
      order: 'desc',
    });
    expect(desc.data.map((d) => d.averageRating)).toEqual([5, 4, 3]);
  });

  it('breaks ties deterministically by name, then _id', async () => {
    // same price -> same sort key; the tie-break must still give a stable order
    const b = hotel(51, { name: 'Bravo' });
    const a = hotel(50, { name: 'Alpha' });
    const roomsByHotelId = {
      [a._id.toString()]: [{ maxAdults: 2, maxChildren: 0, pricePerNight: 80 }],
      [b._id.toString()]: [{ maxAdults: 2, maxChildren: 0, pricePerNight: 80 }],
    };
    const { service } = build([b, a], roomsByHotelId); // deliberately out of order

    const result = await service.search(baseQuery);

    expect(result.data.map((d) => d.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('paginates: page 2, limit 1 returns the right slice and meta', async () => {
    const hotels = ['A', 'B', 'C'].map((name, i) => hotel(60 + i, { name }));
    const roomsByHotelId: Record<string, FreeRoom[]> = {};
    hotels.forEach((h, i) => {
      roomsByHotelId[h._id.toString()] = [
        { maxAdults: 2, maxChildren: 0, pricePerNight: 100 + i },
      ];
    });
    const { service } = build(hotels, roomsByHotelId);

    const result = await service.search({ ...baseQuery, page: 2, limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('B'); // second cheapest, by price asc
    expect(result.meta).toEqual({ total: 3, page: 2, limit: 1, totalPages: 3 });
  });

  it('returns data: [] and total 0 without calling the availability service when no hotels match', async () => {
    const { service, findFreeRoomsByHotel } = build([], {});

    const result = await service.search(baseQuery);

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(findFreeRoomsByHotel).not.toHaveBeenCalled();
  });
});
