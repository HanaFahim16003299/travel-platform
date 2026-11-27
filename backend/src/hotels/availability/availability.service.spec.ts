import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AvailabilityService, NightStatus } from './availability.service.js';
import { AvailabilityAction } from '../dto/update-availability.dto.js';
import { getNightsBetween } from '../utils/date-range.util.js';
import type { CreateAvailabilityDto } from '../dto/create-availability.dto.js';
import type { UpdateAvailabilityDto } from '../dto/update-availability.dto.js';
import type { QueryAvailabilityDto } from '../dto/query-availability.dto.js';

const HOTEL_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f1f77bcf86cd799439022';

describe('AvailabilityService', () => {
  let hotelModel: { exists: ReturnType<typeof vi.fn> };
  let roomModel: {
    exists: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    countDocuments: ReturnType<typeof vi.fn>;
  };
  let availabilityModel: {
    exists: ReturnType<typeof vi.fn>;
    insertMany: ReturnType<typeof vi.fn>;
    countDocuments: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  // Added by Mohamed Hesham: HTL-08.
  let bookingModel: { find: ReturnType<typeof vi.fn> };
  let service: AvailabilityService;

  // chainable find().sort()...lean() mock, matching the real query builder
  function chainable(result: unknown) {
    const chain = {
      sort: vi.fn(() => chain),
      skip: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      select: vi.fn(() => chain),
      lean: vi.fn(async () => result),
    };
    return chain;
  }

  beforeEach(() => {
    // fixes "now" so tests stay deterministic regardless of the real date
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));

    hotelModel = { exists: vi.fn().mockResolvedValue(true) };
    roomModel = {
      exists: vi.fn().mockResolvedValue(true),
      find: vi.fn(() => chainable([])),
      countDocuments: vi.fn().mockResolvedValue(0),
    };
    availabilityModel = {
      exists: vi.fn().mockResolvedValue(false),
      insertMany: vi.fn().mockResolvedValue(undefined),
      countDocuments: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      find: vi.fn(() => chainable([])),
      aggregate: vi.fn().mockResolvedValue([]),
    };
    bookingModel = { find: vi.fn(() => chainable([])) };
    service = new AvailabilityService(
      hotelModel as never,
      roomModel as never,
      availabilityModel as never,
      bookingModel as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create (HTL-04)', () => {
    const dto: CreateAvailabilityDto = {
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2026-12-04T00:00:00Z'), // 3 nights
    } as CreateAvailabilityDto;

    it('throws 409 when a night in the range is already open', async () => {
      availabilityModel.exists.mockResolvedValue(true); // overlap
      await expect(service.create(HOTEL_ID, ROOM_ID, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(availabilityModel.insertMany).not.toHaveBeenCalled();
    });

    it('throws 409 when a concurrent request wins the race (duplicate key 11000)', async () => {
      availabilityModel.exists.mockResolvedValue(false);
      availabilityModel.insertMany.mockRejectedValue({ code: 11000 });
      await expect(service.create(HOTEL_ID, ROOM_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 400 when the stay starts in the past', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-02T12:00:00Z'));
      await expect(service.create(HOTEL_ID, ROOM_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(availabilityModel.insertMany).not.toHaveBeenCalled();
    });

    it('returns { created: n } for a successful open', async () => {
      const result = await service.create(HOTEL_ID, ROOM_ID, dto);
      expect(result).toEqual({ created: 3 });
    });

    it('inserts one document per night, with real Types.ObjectId ids', async () => {
      await service.create(HOTEL_ID, ROOM_ID, dto);

      const inserted = availabilityModel.insertMany.mock.calls[0][0] as {
        roomId: unknown;
        hotelId: unknown;
        date: Date;
      }[];
      expect(inserted).toHaveLength(3);
      for (const doc of inserted) {
        expect(doc.roomId).toBeInstanceOf(Types.ObjectId);
        expect(doc.hotelId).toBeInstanceOf(Types.ObjectId);
        expect((doc.roomId as Types.ObjectId).toString()).toBe(ROOM_ID);
        expect((doc.hotelId as Types.ObjectId).toString()).toBe(HOTEL_ID);
      }
      expect(inserted.map((doc) => doc.date.toISOString())).toEqual([
        '2026-12-01T00:00:00.000Z',
        '2026-12-02T00:00:00.000Z',
        '2026-12-03T00:00:00.000Z',
      ]);
    });
  });

  describe('update (HTL-05/06)', () => {
    const dto: UpdateAvailabilityDto = {
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2026-12-04T00:00:00Z'), // 3 nights
      action: AvailabilityAction.BLOCK,
    } as UpdateAvailabilityDto;

    it('throws 400 when not every night in the range is open', async () => {
      availabilityModel.countDocuments.mockResolvedValue(2); // 1 of 3 missing
      await expect(service.update(HOTEL_ID, ROOM_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(availabilityModel.updateMany).not.toHaveBeenCalled();
      expect(availabilityModel.deleteMany).not.toHaveBeenCalled();
    });

    it('throws 409 and writes nothing when any night is already booked', async () => {
      availabilityModel.countDocuments.mockResolvedValue(3); // all open
      availabilityModel.exists.mockResolvedValue(true); // a booked night
      await expect(service.update(HOTEL_ID, ROOM_ID, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(availabilityModel.updateMany).not.toHaveBeenCalled();
      expect(availabilityModel.deleteMany).not.toHaveBeenCalled();

      // the booked-night check must use the exact same range filter as the
      // open-night check, with bookingId: { $ne: null } added on top
      const nights = getNightsBetween(dto.startDate, dto.endDate);
      const range = {
        roomId: new Types.ObjectId(ROOM_ID),
        date: { $in: nights },
      };
      expect(availabilityModel.countDocuments).toHaveBeenCalledWith(range);
      expect(availabilityModel.exists).toHaveBeenCalledWith({
        ...range,
        bookingId: { $ne: null },
      });
    });

    it('BLOCK uses updateMany, with bookingId: null in the write filter', async () => {
      availabilityModel.countDocuments.mockResolvedValue(3);
      availabilityModel.exists.mockResolvedValue(false);

      await service.update(HOTEL_ID, ROOM_ID, dto);

      expect(availabilityModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: null }),
        { $set: { isBlocked: true } },
      );
      // the booked-night check (distinct from the write filter above) must
      // also require bookingId: { $ne: null }
      expect(availabilityModel.exists).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: { $ne: null } }),
      );
    });

    it('UNBLOCK uses updateMany, with bookingId: null in the write filter', async () => {
      availabilityModel.countDocuments.mockResolvedValue(3);
      availabilityModel.exists.mockResolvedValue(false);

      await service.update(HOTEL_ID, ROOM_ID, {
        ...dto,
        action: AvailabilityAction.UNBLOCK,
      });

      expect(availabilityModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: null }),
        { $set: { isBlocked: false } },
      );
    });

    it('REMOVE uses deleteMany, not updateMany', async () => {
      availabilityModel.countDocuments.mockResolvedValue(3);
      availabilityModel.exists.mockResolvedValue(false);
      availabilityModel.deleteMany.mockResolvedValue({ deletedCount: 3 });

      const result = await service.update(HOTEL_ID, ROOM_ID, {
        ...dto,
        action: AvailabilityAction.REMOVE,
      });

      expect(availabilityModel.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: null }),
      );
      expect(availabilityModel.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ requested: 3, removed: 3 });
    });
  });

  describe('getHotelAvailability (HTL-08)', () => {
    const query: QueryAvailabilityDto = {
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2026-12-04T00:00:00Z'), // 3 nights
      page: 1,
      limit: 10,
    } as QueryAvailabilityDto;

    it('BOOKED wins over BLOCKED when both are set on the same night', async () => {
      const bookingId = new Types.ObjectId();
      roomModel.find.mockReturnValue(
        chainable([
          { _id: new Types.ObjectId(ROOM_ID), name: 'Room 1', isActive: true },
        ]),
      );
      roomModel.countDocuments.mockResolvedValue(1);
      availabilityModel.find.mockReturnValue(
        chainable([
          {
            roomId: new Types.ObjectId(ROOM_ID),
            date: new Date('2026-12-01T00:00:00Z'),
            isBlocked: true,
            bookingId,
          },
        ]),
      );

      const result = await service.getHotelAvailability(HOTEL_ID, query);

      expect(result.data[0].nights[0].status).toBe(NightStatus.BOOKED);
    });

    // Added by Mohamed Hesham: HTL-08 tests.
    it('shows the booking reference on a booked night of a confirmed booking', async () => {
      const bookingId = new Types.ObjectId();
      roomModel.find.mockReturnValue(
        chainable([
          { _id: new Types.ObjectId(ROOM_ID), name: 'Room 1', isActive: true },
        ]),
      );
      roomModel.countDocuments.mockResolvedValue(1);
      availabilityModel.find.mockReturnValue(
        chainable([
          {
            roomId: new Types.ObjectId(ROOM_ID),
            date: new Date('2026-12-01T00:00:00Z'),
            isBlocked: false,
            bookingId,
          },
        ]),
      );
      bookingModel.find.mockReturnValue(
        chainable([{ _id: bookingId, bookingReference: 'ABC234' }]),
      );

      const result = await service.getHotelAvailability(HOTEL_ID, query);

      expect(result.data[0].nights[0].bookingReference).toBe('ABC234');
    });

    it('shows no reference on a booked night whose booking is not confirmed yet', async () => {
      const bookingId = new Types.ObjectId();
      roomModel.find.mockReturnValue(
        chainable([
          { _id: new Types.ObjectId(ROOM_ID), name: 'Room 1', isActive: true },
        ]),
      );
      roomModel.countDocuments.mockResolvedValue(1);
      availabilityModel.find.mockReturnValue(
        chainable([
          {
            roomId: new Types.ObjectId(ROOM_ID),
            date: new Date('2026-12-01T00:00:00Z'),
            isBlocked: false,
            bookingId,
          },
        ]),
      );
      // a pending booking has no bookingReference, so the query finds nothing

      const result = await service.getHotelAvailability(HOTEL_ID, query);

      expect(result.data[0].nights[0].status).toBe(NightStatus.BOOKED);
      expect(result.data[0].nights[0]).not.toHaveProperty('bookingReference');
    });

    it('does not query bookings when no night on the page is booked', async () => {
      roomModel.find.mockReturnValue(
        chainable([
          { _id: new Types.ObjectId(ROOM_ID), name: 'Room 1', isActive: true },
        ]),
      );
      roomModel.countDocuments.mockResolvedValue(1);
      availabilityModel.find.mockReturnValue(
        chainable([
          {
            roomId: new Types.ObjectId(ROOM_ID),
            date: new Date('2026-12-01T00:00:00Z'),
            isBlocked: false,
            bookingId: null,
          },
        ]),
      );

      await service.getHotelAvailability(HOTEL_ID, query);

      expect(bookingModel.find).not.toHaveBeenCalled();
    });

    it('omits nights that were never opened instead of listing them as a status', async () => {
      roomModel.find.mockReturnValue(
        chainable([
          { _id: new Types.ObjectId(ROOM_ID), name: 'Room 1', isActive: true },
        ]),
      );
      roomModel.countDocuments.mockResolvedValue(1);
      // only 1 of the 3 requested nights was ever opened
      availabilityModel.find.mockReturnValue(
        chainable([
          {
            roomId: new Types.ObjectId(ROOM_ID),
            date: new Date('2026-12-01T00:00:00Z'),
            isBlocked: false,
            bookingId: null,
          },
        ]),
      );

      const result = await service.getHotelAvailability(HOTEL_ID, query);

      expect(result.data[0].nights).toHaveLength(1);
    });

    it('returns pagination meta built from the room count', async () => {
      roomModel.find.mockReturnValue(chainable([]));
      roomModel.countDocuments.mockResolvedValue(23);

      const result = await service.getHotelAvailability(HOTEL_ID, {
        ...query,
        page: 2,
        limit: 10,
      });

      expect(result.meta).toEqual({
        total: 23,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });
  });

  describe('findFreeRooms (HTL-11/HTL-15)', () => {
    it('matches hotelId as a real Types.ObjectId, the requested nights, isBlocked false and bookingId null, grouped by freeNights == nights.length', async () => {
      availabilityModel.aggregate.mockResolvedValue([]);

      await service.findFreeRooms(
        HOTEL_ID,
        new Date('2026-12-01T00:00:00Z'),
        new Date('2026-12-04T00:00:00Z'),
        1,
        10,
      );

      const pipeline = availabilityModel.aggregate.mock.calls[0][0];
      expect(pipeline[0]).toEqual({
        $match: {
          hotelId: expect.any(Types.ObjectId),
          date: {
            $in: [
              new Date('2026-12-01T00:00:00Z'),
              new Date('2026-12-02T00:00:00Z'),
              new Date('2026-12-03T00:00:00Z'),
            ],
          },
          isBlocked: false,
          bookingId: null,
        },
      });
      expect((pipeline[0].$match.hotelId as Types.ObjectId).toString()).toBe(
        HOTEL_ID,
      );
      expect(pipeline[1]).toEqual({
        $group: { _id: '$roomId', freeNights: { $sum: 1 } },
      });
      expect(pipeline[2]).toEqual({ $match: { freeNights: 3 } });
    });

    it('excludes inactive rooms from the result', async () => {
      const freeRoomId = new Types.ObjectId();
      availabilityModel.aggregate.mockResolvedValue([{ _id: freeRoomId }]);
      const find = vi.fn(() => chainable([]));
      roomModel.find = find;

      await service.findFreeRooms(
        HOTEL_ID,
        new Date('2026-12-01T00:00:00Z'),
        new Date('2026-12-04T00:00:00Z'),
        1,
        10,
      );

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    // Added by Mohamed Hesham: GEN-05 tests.
    it('returns one page: skips (page - 1) x limit rooms and reports the total', async () => {
      availabilityModel.aggregate.mockResolvedValue([
        { _id: new Types.ObjectId() },
      ]);
      const chain = chainable([{ name: 'Room 11' }]);
      roomModel.find = vi.fn(() => chain);
      roomModel.countDocuments.mockResolvedValue(23);

      const result = await service.findFreeRooms(
        HOTEL_ID,
        new Date('2026-12-01T00:00:00Z'),
        new Date('2026-12-04T00:00:00Z'),
        2,
        10,
      );

      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual({ rooms: [{ name: 'Room 11' }], total: 23 });
    });
  });

  describe('findFreeRoomsByHotel (HTL-11/HTL-12)', () => {
    it('matches hotelId with $in of real Types.ObjectId values, in a single aggregate call', async () => {
      const hotelA = new Types.ObjectId();
      const hotelB = new Types.ObjectId();
      availabilityModel.aggregate.mockResolvedValue([]);

      await service.findFreeRoomsByHotel(
        [hotelA, hotelB],
        new Date('2026-12-01T00:00:00Z'),
        new Date('2026-12-04T00:00:00Z'),
      );

      expect(availabilityModel.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = availabilityModel.aggregate.mock.calls[0][0];
      const hotelMatch = pipeline[0].$match.hotelId as {
        $in: Types.ObjectId[];
      };
      expect(hotelMatch.$in).toHaveLength(2);
      for (const id of hotelMatch.$in) {
        expect(id).toBeInstanceOf(Types.ObjectId);
      }
    });

    it('groups the free, active rooms per hotel', async () => {
      const roomIdA = new Types.ObjectId();
      const roomIdB = new Types.ObjectId();
      const hotelA = new Types.ObjectId();
      const hotelB = new Types.ObjectId();
      availabilityModel.aggregate.mockResolvedValue([
        { _id: roomIdA },
        { _id: roomIdB },
      ]);
      roomModel.find = vi.fn(() =>
        chainable([
          { _id: roomIdA, hotelId: hotelA, pricePerNight: 100 },
          { _id: roomIdB, hotelId: hotelB, pricePerNight: 150 },
        ]),
      );

      const byHotel = await service.findFreeRoomsByHotel(
        [hotelA, hotelB],
        new Date('2026-12-01T00:00:00Z'),
        new Date('2026-12-04T00:00:00Z'),
      );

      expect(byHotel.get(hotelA.toString())).toEqual([
        { _id: roomIdA, hotelId: hotelA, pricePerNight: 100 },
      ]);
      expect(byHotel.get(hotelB.toString())).toEqual([
        { _id: roomIdB, hotelId: hotelB, pricePerNight: 150 },
      ]);
    });
  });
});
