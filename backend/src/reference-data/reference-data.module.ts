import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferenceDataSeeder } from './reference-data.seeder.js';
import { Airport, AirportSchema } from './schemas/airport.schema.js';
import { Attraction, AttractionSchema } from './schemas/attraction.schema.js';
import { City, CitySchema } from './schemas/city.schema.js';
import { Country, CountrySchema } from './schemas/country.schema.js';

// GEN-12: wired by Mohamed Hesham so the reference data is seeded when the app starts.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: City.name, schema: CitySchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Attraction.name, schema: AttractionSchema },
    ]),
  ],
  providers: [ReferenceDataSeeder],
})
export class ReferenceDataModule {}
