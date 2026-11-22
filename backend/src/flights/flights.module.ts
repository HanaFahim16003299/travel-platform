import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema.js';
import { Flight, FlightSchema } from './schemas/flight.schema.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: Airline.name, schema: AirlineSchema },
    ]),
  ],
  controllers: [FlightsController],
  providers: [FlightsService],
  exports: [FlightsService, MongooseModule],
})
export class FlightsModule {}
