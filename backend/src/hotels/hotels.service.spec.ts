import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HotelsService } from './hotels.service.js';
import type { CreateHotelDto } from './dto/create-hotel.dto.js';
import type { UpdateHotelDto } from './dto/update-hotel.dto.js';
import type { UpdatePoliciesDto } from './dto/update-policies.dto.js';

const HOTEL_ID = '507f1f77bcf86cd799439011';
const CITY_ID = '507f1f77bcf86cd799439022';

describe('HotelsService', () => {
  let hotelModel: {
    exists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
  };
  let service: HotelsService;

  beforeEach(() => {
    hotelModel = {
      exists: vi.fn(),
      create: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
    service = new HotelsService(hotelModel as never);
  });

  describe('create (HTL-01)', () => {
    const dto = {
      name: 'Grand Hotel',
      cityId: CITY_ID,
    } as CreateHotelDto;

    it('throws 409 and creates nothing when the name already exists in the city', async () => {
      hotelModel.exists.mockResolvedValue(true);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(hotelModel.create).not.toHaveBeenCalled();
    });

    it('checks for duplicates by name and cityId, then creates the hotel', async () => {
      const created = { _id: HOTEL_ID, ...dto };
      hotelModel.exists.mockResolvedValue(null);
      hotelModel.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(hotelModel.exists).toHaveBeenCalledWith({
        name: dto.name,
        cityId: dto.cityId,
      });
      expect(hotelModel.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(created);
    });
  });

  describe('findOne (HTL-02)', () => {
    // findOne(...).lean() is how the service reads a hotel
    function leanResult(result: unknown) {
      return { lean: vi.fn().mockResolvedValue(result) };
    }

    it('throws 400 for an invalid id without querying', async () => {
      await expect(service.findOne('not-an-id')).rejects.toThrow(
        BadRequestException,
      );
      expect(hotelModel.findOne).not.toHaveBeenCalled();
    });

    it('throws 404 when the hotel does not exist or is inactive', async () => {
      hotelModel.findOne.mockReturnValue(leanResult(null));

      await expect(service.findOne(HOTEL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('queries only active hotels by id and returns the hotel', async () => {
      const hotel = { _id: HOTEL_ID, name: 'Grand Hotel' };
      hotelModel.findOne.mockReturnValue(leanResult(hotel));

      const result = await service.findOne(HOTEL_ID);

      expect(hotelModel.findOne).toHaveBeenCalledWith({
        _id: HOTEL_ID,
        isActive: true,
      });
      expect(result).toBe(hotel);
    });
  });

  describe('update (HTL-01)', () => {
    const dto = { description: 'Newly renovated' } as UpdateHotelDto;

    it('throws 400 for an invalid id without querying', async () => {
      await expect(service.update('not-an-id', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 when the hotel does not exist or is inactive', async () => {
      hotelModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.update(HOTEL_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates an active hotel with $set, returns the new document and runs validators', async () => {
      const updated = { _id: HOTEL_ID, ...dto };
      hotelModel.findOneAndUpdate.mockResolvedValue(updated);

      const result = await service.update(HOTEL_ID, dto);

      expect(hotelModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: HOTEL_ID, isActive: true },
        { $set: dto },
        { new: true, runValidators: true },
      );
      expect(result).toBe(updated);
    });
  });

  describe('updatePolicies (HTL-09/HTL-10)', () => {
    function buildDto(
      tiers: { daysBeforeCheckIn: number; refundPercent: number }[],
    ): UpdatePoliciesDto {
      return {
        checkInTime: '14:00',
        checkOutTime: '11:00',
        cancellationTiers: tiers,
      } as UpdatePoliciesDto;
    }

    it('throws 400 for an invalid id without querying', async () => {
      await expect(
        service.updatePolicies('not-an-id', buildDto([])),
      ).rejects.toThrow(BadRequestException);
      expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 400 when two tiers share the same daysBeforeCheckIn and writes nothing', async () => {
      const dto = buildDto([
        { daysBeforeCheckIn: 7, refundPercent: 100 },
        { daysBeforeCheckIn: 7, refundPercent: 50 },
      ]);

      await expect(service.updatePolicies(HOTEL_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 when the hotel does not exist or is inactive', async () => {
      hotelModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updatePolicies(
          HOTEL_ID,
          buildDto([{ daysBeforeCheckIn: 7, refundPercent: 100 }]),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('stores the tiers sorted by daysBeforeCheckIn descending, together with the check-in/out times', async () => {
      const dto = buildDto([
        { daysBeforeCheckIn: 1, refundPercent: 0 },
        { daysBeforeCheckIn: 14, refundPercent: 100 },
        { daysBeforeCheckIn: 7, refundPercent: 50 },
      ]);
      hotelModel.findOneAndUpdate.mockResolvedValue({
        checkInTime: '14:00',
        checkOutTime: '11:00',
        policies: { cancellationTiers: [] },
      });

      await service.updatePolicies(HOTEL_ID, dto);

      expect(hotelModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: HOTEL_ID, isActive: true },
        {
          $set: {
            checkInTime: '14:00',
            checkOutTime: '11:00',
            'policies.cancellationTiers': [
              { daysBeforeCheckIn: 14, refundPercent: 100 },
              { daysBeforeCheckIn: 7, refundPercent: 50 },
              { daysBeforeCheckIn: 1, refundPercent: 0 },
            ],
          },
        },
        { new: true, runValidators: true },
      );
    });

    it('does not mutate the tiers array it received', async () => {
      const dto = buildDto([
        { daysBeforeCheckIn: 1, refundPercent: 0 },
        { daysBeforeCheckIn: 14, refundPercent: 100 },
      ]);
      hotelModel.findOneAndUpdate.mockResolvedValue({
        checkInTime: '14:00',
        checkOutTime: '11:00',
        policies: { cancellationTiers: [] },
      });

      await service.updatePolicies(HOTEL_ID, dto);

      expect(dto.cancellationTiers.map((t) => t.daysBeforeCheckIn)).toEqual([
        1, 14,
      ]);
    });

    it('returns only the check-in/out times and the stored tiers', async () => {
      const storedTiers = [{ daysBeforeCheckIn: 7, refundPercent: 100 }];
      hotelModel.findOneAndUpdate.mockResolvedValue({
        _id: HOTEL_ID,
        name: 'Grand Hotel',
        checkInTime: '15:00',
        checkOutTime: '12:00',
        policies: { cancellationTiers: storedTiers },
      });

      const result = await service.updatePolicies(
        HOTEL_ID,
        buildDto(storedTiers),
      );

      expect(result).toEqual({
        checkInTime: '15:00',
        checkOutTime: '12:00',
        cancellationTiers: storedTiers,
      });
    });
  });
});
