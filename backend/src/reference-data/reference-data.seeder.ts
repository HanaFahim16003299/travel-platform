import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { loadReferenceData } from './reference-data.loader.js';
import type { ReferenceDataset } from './reference-data.loader.js';
import { referenceObjectId } from './reference-ids.js';
import { Airport } from './schemas/airport.schema.js';
import type { AirportDocument } from './schemas/airport.schema.js';
import { Attraction } from './schemas/attraction.schema.js';
import type { AttractionDocument } from './schemas/attraction.schema.js';
import { City } from './schemas/city.schema.js';
import type { CityDocument } from './schemas/city.schema.js';
import { Country } from './schemas/country.schema.js';
import type { CountryDocument } from './schemas/country.schema.js';

/**
 * GEN-12: seeds countries, cities, airports and attractions when the app starts.
 *
 * Safe to run on every start: each record is upserted under a deterministic
 * _id (see reference-ids.ts), so nothing is duplicated and every teammate's
 * database ends up identical. To change the data, edit the CSV files in
 * backend/data/reference/ and restart.
 */
@Injectable()
export class ReferenceDataSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReferenceDataSeeder.name);

  constructor(
    @InjectModel(Country.name) private readonly countries: Model<CountryDocument>,
    @InjectModel(City.name) private readonly cities: Model<CityDocument>,
    @InjectModel(Airport.name) private readonly airports: Model<AirportDocument>,
    @InjectModel(Attraction.name) private readonly attractions: Model<AttractionDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.seed(loadReferenceData());
      this.logger.log(
        `Reference data ready: ${result.countries} countries, ${result.cities} cities, ` +
          `${result.airports} airports, ${result.attractions} attractions`,
      );
    } catch (error) {
      // Do not stop the whole API for a bad CSV, but make the problem impossible to miss.
      this.logger.error(`Reference data seeding FAILED: ${(error as Error).message}`);
    }
  }

  async seed(data: ReferenceDataset) {
    const countryByCode = new Map(data.countries.map((c) => [c.code, c]));
    const cityByKey = new Map(data.cities.map((c) => [c.key, c]));

    await this.countries.bulkWrite(
      data.countries.map((c) => ({
        updateOne: {
          filter: { _id: referenceObjectId('country', c.code) },
          update: { $set: { code: c.code, name: c.name, currency: c.currency } },
          upsert: true,
        },
      })),
    );

    await this.cities.bulkWrite(
      data.cities.map((c) => ({
        updateOne: {
          filter: { _id: referenceObjectId('city', c.key) },
          update: { $set: { key: c.key, name: c.name, countryCode: c.countryCode } },
          upsert: true,
        },
      })),
    );

    await this.airports.bulkWrite(
      data.airports.map((a) => {
        const city = cityByKey.get(a.cityKey)!;
        const country = countryByCode.get(a.countryCode)!;
        return {
          updateOne: {
            filter: { _id: referenceObjectId('airport', a.iataCode) },
            update: {
              $set: {
                iataCode: a.iataCode,
                name: a.name,
                cityId: referenceObjectId('city', a.cityKey),
                cityKey: a.cityKey,
                cityName: city.name,
                countryCode: a.countryCode,
                countryName: country.name,
                timeZone: a.timeZone,
              },
            },
            upsert: true,
          },
        };
      }),
    );

    await this.attractions.bulkWrite(
      data.attractions.map((a) => ({
        updateOne: {
          filter: { _id: referenceObjectId('attraction', a.key) },
          update: {
            $set: {
              key: a.key,
              name: a.name,
              cityId: referenceObjectId('city', a.cityKey),
              cityKey: a.cityKey,
            },
          },
          upsert: true,
        },
      })),
    );

    return {
      countries: data.countries.length,
      cities: data.cities.length,
      airports: data.airports.length,
      attractions: data.attractions.length,
    };
  }
}
