import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema.js';
import { Flight, FlightSchema } from './schemas/flight.schema.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';
import { FlightCancellationHooks } from './flight-cancellation.hooks.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: Airline.name, schema: AirlineSchema },
    ]),
  ],
  controllers: [FlightsController],
  // FlightCancellationHooks: FLT-06 listeners, added by Joumana Hozayen (review A3).
  providers: [FlightsService, FlightCancellationHooks],
  exports: [FlightsService, FlightCancellationHooks, MongooseModule],
})
export class FlightsModule {}
