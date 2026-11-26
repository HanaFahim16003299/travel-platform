import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service.js';
import type { CreateRoomDto } from '../dto/create-room.dto.js';
import type { UpdateRoomDto } from '../dto/update-room.dto.js';
import type { QueryFreeRoomsDto } from '../dto/query-free-rooms.dto.js';

const HOTEL_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f1f77bcf86cd799439022';

describe('RoomsService', () => {
  let hotelModel: { exists: ReturnType<typeof vi.fn> };
  let roomModel: {
    create: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let availabilityModel: {
    exists: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  // Added by Mohamed Hesham: HTL-06.
  let bookingModel: { exists: ReturnType<typeof vi.fn> };
  let availabilityService: { findFreeRooms: ReturnType<typeof vi.fn> };
  let service: RoomsService;

  beforeEach(() => {
    hotelModel = { exists: vi.fn() };
    roomModel = {
      create: vi.fn(),
      exists: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findOne: vi.fn(),
    };
    availabilityModel = { exists: vi.fn(), deleteMany: vi.fn() };
    bookingModel = { exists: vi.fn().mockResolvedValue(null) };
    availabilityService = { findFreeRooms: vi.fn() };
    service = new RoomsService(
      hotelModel as never,
      roomModel as never,
      availabilityModel as never,
      bookingModel as never,
      availabilityService as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createRoom (HTL-03)', () => {
    it('throws 400 for an invalid hotel id', async () => {
      await expect(
        service.createRoom('not-an-id', {} as CreateRoomDto),
      ).rejects.toThrow(BadRequestException);
      expect(hotelModel.exists).not.toHaveBeenCalled();
    });

    it('throws 404 when the hotel is unknown or inactive', async () => {
      hotelModel.exists.mockResolvedValue(null);
      await expect(
        service.createRoom(HOTEL_ID, {} as CreateRoomDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates the room when the hotel is active', async () => {
      hotelModel.exists.mockResolvedValue(true);
      const created = { _id: ROOM_ID };
      roomModel.create.mockResolvedValue(created);
      const dto = { name: 'Room 1' } as CreateRoomDto;

      await expect(service.createRoom(HOTEL_ID, dto)).resolves.toBe(created);
      expect(roomModel.create).toHaveBeenCalledWith({
        name: 'Room 1',
        hotelId: HOTEL_ID,
      });
    });

    it('throws 409 when the room name already exists (duplicate key 11000)', async () => {
      hotelModel.exists.mockResolvedValue(true);
      roomModel.create.mockRejectedValue({ code: 11000 });
      await expect(
        service.createRoom(HOTEL_ID, {} as CreateRoomDto),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows errors other than a duplicate key', async () => {
      hotelModel.exists.mockResolvedValue(true);
      const other = new Error('boom');
      roomModel.create.mockRejectedValue(other);
      await expect(
        service.createRoom(HOTEL_ID, {} as CreateRoomDto),
      ).rejects.toBe(other);
    });
  });

  describe('updateRoom (HTL-05/06)', () => {
    it('throws 400 for an invalid hotel or room id', async () => {
      const dto = {} as UpdateRoomDto;
      await expect(service.updateRoom('bad', ROOM_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateRoom(HOTEL_ID, 'bad', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 404 when the hotel is unknown or inactive', async () => {
      hotelModel.exists.mockResolvedValue(null);
      await expect(
        service.updateRoom(HOTEL_ID, ROOM_ID, {} as UpdateRoomDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses deactivation with 409 when an upcoming night has a bookingId', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-01T15:30:00Z'));

      hotelModel.exists.mockResolvedValue(true);
      roomModel.exists.mockResolvedValue(true); // room is currently active
      availabilityModel.exists.mockResolvedValue(true); // upcoming booked night

      await expect(
        service.updateRoom(HOTEL_ID, ROOM_ID, {
          isActive: false,
        } as UpdateRoomDto),
      ).rejects.toThrow(ConflictException);
      expect(roomModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(availabilityModel.exists).toHaveBeenCalledWith({
        roomId: ROOM_ID,
        bookingId: { $ne: null },
        date: { $gte: new Date('2026-11-01T00:00:00.000Z') },
      });
    });

    it('allows deactivation when there is no upcoming booking', async () => {
      hotelModel.exists.mockResolvedValue(true);
      roomModel.exists.mockResolvedValue(true);
      availabilityModel.exists.mockResolvedValue(false);
      const updated = { _id: ROOM_ID, isActive: false };
      roomModel.findOneAndUpdate.mockResolvedValue(updated);

      await expect(
        service.updateRoom(HOTEL_ID, ROOM_ID, {
          isActive: false,
        } as UpdateRoomDto),
      ).resolves.toBe(updated);
    });

    it('allows reactivation without checking for upcoming bookings', async () => {
      hotelModel.exists.mockResolvedValue(true);
      const updated = { _id: ROOM_ID, isActive: true };
      roomModel.findOneAndUpdate.mockResolvedValue(updated);

      await expect(
        service.updateRoom(HOTEL_ID, ROOM_ID, {
          isActive: true,
        } as UpdateRoomDto),
      ).resolves.toBe(updated);
      expect(roomModel.exists).not.toHaveBeenCalled();
      expect(availabilityModel.exists).not.toHaveBeenCalled();
    });

    it('throws 404 when the room to update is not found', async () => {
      hotelModel.exists.mockResolvedValue(true);
      roomModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(
        service.updateRoom(HOTEL_ID, ROOM_ID, { name: 'x' } as UpdateRoomDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteRoom (HTL-06)', () => {
    it('throws 400 for an invalid hotel or room id', async () => {
      await expect(service.deleteRoom('bad', ROOM_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteRoom(HOTEL_ID, 'bad')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 404 when the hotel is unknown or inactive', async () => {
      hotelModel.exists.mockResolvedValue(null);
      await expect(service.deleteRoom(HOTEL_ID, ROOM_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when the room is not found', async () => {
      hotelModel.exists.mockResolvedValue(true);
      roomModel.findOne.mockResolvedValue(null);
      await expect(service.deleteRoom(HOTEL_ID, ROOM_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 409 when the room has any booking (past or future) and deletes nothing', async () => {
      hotelModel.exists.mockResolvedValue(true);
      const deleteOne = vi.fn();
      roomModel.findOne.mockResolvedValue({ _id: ROOM_ID, deleteOne });
      availabilityModel.exists.mockResolvedValue(true);

      await expect(service.deleteRoom(HOTEL_ID, ROOM_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(availabilityModel.deleteMany).not.toHaveBeenCalled();
      expect(deleteOne).not.toHaveBeenCalled();
      // no date condition: a past booking must block deletion too
      expect(availabilityModel.exists).toHaveBeenCalledWith({
        roomId: ROOM_ID,
        bookingId: { $ne: null },
      });
    });

    // Added by Mohamed Hesham: HTL-06 test. A cancelled or expired booking frees its
    // nights (bookingId back to null), but the room was still reserved once.
    it('throws 409 when only a released (cancelled or expired) booking refers to the room', async () => {
      hotelModel.exists.mockResolvedValue(true);
      const deleteOne = vi.fn();
      roomModel.findOne.mockResolvedValue({ _id: ROOM_ID, deleteOne });
      availabilityModel.exists.mockResolvedValue(null); // nights are free again
      bookingModel.exists.mockResolvedValue({ _id: 'booking' });

      await expect(service.deleteRoom(HOTEL_ID, ROOM_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(bookingModel.exists).toHaveBeenCalledWith({
        'rooms.roomId': ROOM_ID,
      });
      expect(availabilityModel.deleteMany).not.toHaveBeenCalled();
      expect(deleteOne).not.toHaveBeenCalled();
    });

    it('deletes the availability rows before deleting the room', async () => {
      hotelModel.exists.mockResolvedValue(true);
      const calls: string[] = [];
      availabilityModel.deleteMany.mockImplementation(async () => {
        calls.push('deleteAvailability');
      });
      const deleteOne = vi.fn(async () => {
        calls.push('deleteRoom');
      });
      roomModel.findOne.mockResolvedValue({ _id: ROOM_ID, deleteOne });
      availabilityModel.exists.mockResolvedValue(false);

      const result = await service.deleteRoom(HOTEL_ID, ROOM_ID);

      expect(calls).toEqual(['deleteAvailability', 'deleteRoom']);
      expect(availabilityModel.deleteMany).toHaveBeenCalledWith({
        roomId: ROOM_ID,
      });
      expect(result).toEqual({ message: 'Room deleted successfully' });
    });
  });

  describe('findAvailableRooms (HTL-15)', () => {
    const query = {
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2026-12-04T00:00:00Z'), // 3 nights
      page: 1,
      limit: 10,
    } as QueryFreeRoomsDto;

    it('throws 404 for an inactive hotel', async () => {
      hotelModel.exists.mockResolvedValue(null);
      await expect(service.findAvailableRooms(HOTEL_ID, query)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('computes totalPrice for 3 nights x 99.99 without float drift', async () => {
      hotelModel.exists.mockResolvedValue(true);
      availabilityService.findFreeRooms.mockResolvedValue({
        rooms: [{ _id: ROOM_ID, name: 'Room 1', pricePerNight: 99.99 }],
        total: 1,
      });

      const result = await service.findAvailableRooms(HOTEL_ID, query);

      expect(result.nights).toBe(3);
      expect(result.data[0].totalPrice).toBe(299.97);
    });

    it('returns data: [] when no rooms are free', async () => {
      hotelModel.exists.mockResolvedValue(true);
      availabilityService.findFreeRooms.mockResolvedValue({
        rooms: [],
        total: 0,
      });

      const result = await service.findAvailableRooms(HOTEL_ID, query);

      expect(result.data).toEqual([]);
    });

    // Added by Mohamed Hesham: GEN-05 test.
    it('passes page and limit on and returns pagination meta', async () => {
      hotelModel.exists.mockResolvedValue(true);
      availabilityService.findFreeRooms.mockResolvedValue({
        rooms: [],
        total: 23,
      });

      const result = await service.findAvailableRooms(HOTEL_ID, {
        ...query,
        page: 2,
        limit: 10,
      });

      expect(availabilityService.findFreeRooms).toHaveBeenCalledWith(
        HOTEL_ID,
        query.startDate,
        query.endDate,
        2,
        10,
      );
      expect(result.meta).toEqual({
        total: 23,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });
  });
});
