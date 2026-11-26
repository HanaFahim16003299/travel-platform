import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadReferenceData,
  referenceDataDir,
} from './reference-data.loader.js';
import { ReferenceDataSeeder } from './reference-data.seeder.js';
import { referenceObjectId } from './reference-ids.js';

// Tests written by Mohamed Hesham for GEN-12 (reference data seeding).
describe('ReferenceDataSeeder', () => {
  let countries: { bulkWrite: ReturnType<typeof vi.fn> };
  let cities: { bulkWrite: ReturnType<typeof vi.fn> };
  let airports: { bulkWrite: ReturnType<typeof vi.fn> };
  let attractions: { bulkWrite: ReturnType<typeof vi.fn> };
  let seeder: ReferenceDataSeeder;

  beforeEach(() => {
    countries = { bulkWrite: vi.fn().mockResolvedValue({}) };
    cities = { bulkWrite: vi.fn().mockResolvedValue({}) };
    airports = { bulkWrite: vi.fn().mockResolvedValue({}) };
    attractions = { bulkWrite: vi.fn().mockResolvedValue({}) };
    seeder = new ReferenceDataSeeder(
      countries as never,
      cities as never,
      airports as never,
      attractions as never,
    );
  });

  it('upserts every record and reports the counts', async () => {
    const result = await seeder.seed(loadReferenceData(referenceDataDir()));

    expect(result).toEqual({
      countries: 8,
      cities: 8,
      airports: 8,
      attractions: 8,
    });
    for (const model of [countries, cities, airports, attractions]) {
      const operations = model.bulkWrite.mock.calls[0][0];
      expect(operations).toHaveLength(8);
      expect(
        operations.every(
          (op: { updateOne: { upsert: boolean } }) => op.updateOne.upsert,
        ),
      ).toBe(true);
    }
  });

  it('uses the same _id for the same record on every run', async () => {
    const data = loadReferenceData(referenceDataDir());

    await seeder.seed(data);
    await seeder.seed(data);

    const [firstRun, secondRun] = cities.bulkWrite.mock.calls.map((call) =>
      call[0].map(
        (op: { updateOne: { filter: { _id: { toHexString(): string } } } }) =>
          op.updateOne.filter._id.toHexString(),
      ),
    );
    expect(firstRun).toEqual(secondRun);
    expect(firstRun).toContain(
      referenceObjectId('city', 'cairo').toHexString(),
    );
  });

  it('links an airport to its city by the city document _id and copies the names', async () => {
    await seeder.seed(loadReferenceData(referenceDataDir()));

    const cai = airports.bulkWrite.mock.calls[0][0].find(
      (op: { updateOne: { update: { $set: { iataCode: string } } } }) =>
        op.updateOne.update.$set.iataCode === 'CAI',
    );
    expect(cai.updateOne.update.$set).toMatchObject({
      cityKey: 'cairo',
      cityName: 'Cairo',
      countryName: 'Egypt',
      timeZone: 'Africa/Cairo',
    });
    expect(
      cai.updateOne.update.$set.cityId.equals(
        referenceObjectId('city', 'cairo'),
      ),
    ).toBe(true);
  });

  it('does not stop the application when seeding fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    countries.bulkWrite.mockRejectedValue(new Error('database down'));

    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
