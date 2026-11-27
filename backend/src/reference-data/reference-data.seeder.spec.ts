import { describe, expect, it, vi } from 'vitest';
import { loadReferenceData } from './reference-data.loader.js';
import { ReferenceDataSeeder } from './reference-data.seeder.js';
import { referenceObjectId } from './reference-ids.js';

function fakeModel() {
  return { bulkWrite: vi.fn().mockResolvedValue({}) };
}

function build() {
  const countries = fakeModel();
  const cities = fakeModel();
  const airports = fakeModel();
  const attractions = fakeModel();
  const seeder = new ReferenceDataSeeder(
    countries as never,
    cities as never,
    airports as never,
    attractions as never,
  );
  return { seeder, countries, cities, airports, attractions };
}

describe('ReferenceDataSeeder', () => {
  it('upserts every record and reports the counts', async () => {
    const { seeder, countries, cities, airports, attractions } = build();
    const result = await seeder.seed(loadReferenceData());

    expect(result).toEqual({ countries: 8, cities: 8, airports: 8, attractions: 8 });
    expect(countries.bulkWrite.mock.calls[0][0]).toHaveLength(8);
    expect(cities.bulkWrite.mock.calls[0][0]).toHaveLength(8);
    expect(airports.bulkWrite.mock.calls[0][0]).toHaveLength(8);
    expect(attractions.bulkWrite.mock.calls[0][0]).toHaveLength(8);
  });

  it('only upserts, so running twice cannot create duplicates', async () => {
    const { seeder, airports } = build();
    await seeder.seed(loadReferenceData());
    for (const op of airports.bulkWrite.mock.calls[0][0]) {
      expect(op.updateOne.upsert).toBe(true);
      expect(op.updateOne.filter._id).toBeDefined();
    }
  });

  it('stores each airport under a fixed id with its city, country and time zone', async () => {
    const { seeder, airports } = build();
    await seeder.seed(loadReferenceData());
    const ops = airports.bulkWrite.mock.calls[0][0];
    const cairo = ops.find((o: { updateOne: { update: { $set: { iataCode: string } } } }) =>
      o.updateOne.update.$set.iataCode === 'CAI',
    );

    expect(cairo.updateOne.filter._id.toHexString()).toBe(referenceObjectId('airport', 'CAI').toHexString());
    expect(cairo.updateOne.update.$set).toMatchObject({
      cityName: 'Cairo',
      countryName: 'Egypt',
      countryCode: 'EG',
      timeZone: 'Africa/Cairo',
    });
    expect(cairo.updateOne.update.$set.cityId.toHexString()).toBe(
      referenceObjectId('city', 'cairo').toHexString(),
    );
  });

  it('does not stop the app when seeding fails', async () => {
    const { seeder, countries } = build();
    countries.bulkWrite.mockRejectedValueOnce(new Error('db down'));
    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
