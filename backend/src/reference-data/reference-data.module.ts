import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferenceDataController } from './reference-data.controller.js';
import { ReferenceDataSeeder } from './reference-data.seeder.js';
import { ReferenceDataService } from './reference-data.service.js';
import { Airport, AirportSchema } from './schemas/airport.schema.js';
import { Attraction, AttractionSchema } from './schemas/attraction.schema.js';
import { City, CitySchema } from './schemas/city.schema.js';
import { Country, CountrySchema } from './schemas/country.schema.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: City.name, schema: CitySchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Attraction.name, schema: AttractionSchema },
    ]),
  ],
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService, ReferenceDataSeeder],
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
