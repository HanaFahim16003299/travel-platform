import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DestinationsService } from './destinations.service.js';

// Tests written by Mohamed Hesham for HTL-11 and HTL-01.
const CITY_ID = '507f1f77bcf86cd799439022';

// find(...).select(...).lean() is how the service reads the reference data
function findResult(result: unknown[]) {
  const lean = vi.fn().mockResolvedValue(result);
  return { select: vi.fn().mockReturnValue({ lean }) };
}

describe('DestinationsService', () => {
  let cityModel: {
    find: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
  };
  let countryModel: { find: ReturnType<typeof vi.fn> };
  let service: DestinationsService;

  beforeEach(() => {
    cityModel = { find: vi.fn(), exists: vi.fn() };
    countryModel = { find: vi.fn() };
    service = new DestinationsService(
      cityModel as never,
      countryModel as never,
    );
  });

  describe('findCityIds (HTL-11)', () => {
    it('returns the ids of the cities that match by city name or by country', async () => {
      const cairo = new Types.ObjectId();
      const alexandria = new Types.ObjectId();
      countryModel.find.mockReturnValue(findResult([{ code: 'EG' }]));
      cityModel.find.mockReturnValue(
        findResult([{ _id: cairo }, { _id: alexandria }]),
      );

      const ids = await service.findCityIds('Egypt');

      expect(ids).toEqual([cairo, alexandria]);
      expect(cityModel.find).toHaveBeenCalledWith({
        $or: [{ name: /Egypt/i }, { countryCode: { $in: ['EG'] } }],
      });
    });

    it('matches a country by name or by its exact upper-cased code', async () => {
      countryModel.find.mockReturnValue(findResult([]));
      cityModel.find.mockReturnValue(findResult([]));

      await service.findCityIds('  eg ');

      expect(countryModel.find).toHaveBeenCalledWith({
        $or: [{ name: /eg/i }, { code: 'EG' }],
      });
    });

    it('treats the text literally, not as a regular expression', async () => {
      countryModel.find.mockReturnValue(findResult([]));
      cityModel.find.mockReturnValue(findResult([]));

      await service.findCityIds('a.b*');

      expect(countryModel.find).toHaveBeenCalledWith({
        $or: [{ name: /a\.b\*/i }, { code: 'A.B*' }],
      });
    });

    it('returns an empty list when nothing matches', async () => {
      countryModel.find.mockReturnValue(findResult([]));
      cityModel.find.mockReturnValue(findResult([]));

      await expect(service.findCityIds('Atlantis')).resolves.toEqual([]);
    });
  });

  describe('assertCityExists (HTL-01)', () => {
    it('accepts a seeded city', async () => {
      cityModel.exists.mockResolvedValue({ _id: CITY_ID });

      await expect(service.assertCityExists(CITY_ID)).resolves.toBeUndefined();
      expect(cityModel.exists).toHaveBeenCalledWith({ _id: CITY_ID });
    });

    it('throws 400 for a city that is not seeded', async () => {
      cityModel.exists.mockResolvedValue(null);

      await expect(service.assertCityExists(CITY_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
