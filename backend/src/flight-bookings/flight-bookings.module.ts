import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightBookingsController } from './flight-bookings.controller.js';
import { FlightBookingsService } from './flight-bookings.service.js';
import { FlightBooking, FlightBookingSchema } from './schemas/flight-booking.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FlightBooking.name, schema: FlightBookingSchema }]),
  ],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}