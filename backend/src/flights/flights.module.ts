import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema.js';
import {
  FlightBooking,
  FlightBookingSchema,
} from '../flight-bookings/schemas/flight-booking.schema.js';
import { Flight, FlightSchema } from './schemas/flight.schema.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';
import { FlightCancellationHooks } from './flight-cancellation.hooks.js';
import { FlightsScheduler } from './flights.scheduler.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: Airline.name, schema: AirlineSchema },
      // FLT-29 moderator views read bookings through the typed model (review A4/D2).
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
  ],
  controllers: [FlightsController],
  // FlightCancellationHooks: FLT-06 listeners, added by Joumana Hozayen (review A3).
  // FlightsScheduler: FLT-30 Departed status (Joumana Hozayen, review C7).
  providers: [FlightsService, FlightCancellationHooks, FlightsScheduler],
  exports: [FlightsService, FlightCancellationHooks, MongooseModule],
})
export class FlightsModule {}
