import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightsModule } from '../flights/flights.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { FlightBookingsController } from './flight-bookings.controller.js';
import { FlightBookingsService } from './flight-bookings.service.js';
import { FlightBookingsScheduler } from './flight-bookings.scheduler.js';
import { ETicketService } from './e-ticket.service.js';
import { SeatHoldService } from './seat-hold.service.js';
import {
  FlightBooking,
  FlightBookingSchema,
} from './schemas/flight-booking.schema.js';
import {
  Airport,
  AirportSchema,
} from '../reference-data/schemas/airport.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      // E-ticket airport codes and time zones (review D2, Joumana Hozayen).
      { name: Airport.name, schema: AirportSchema },
    ]),
    // Gives us FlightsService.reserveSeats plus the Flight and Airline models.
    // NotificationsModule and AuthModule are @Global, so no import is needed for them.
    FlightsModule,
    PaymentsModule,
  ],
  controllers: [FlightBookingsController],
  providers: [
    FlightBookingsService,
    SeatHoldService,
    FlightBookingsScheduler,
    ETicketService,
  ],
  exports: [FlightBookingsService], // Youssef (payments), Habiba (ACC-12), Mahmoud (FLT-06)
})
export class FlightBookingsModule {}
