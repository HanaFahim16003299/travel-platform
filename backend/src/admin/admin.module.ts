import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema.js';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/schemas/hotel-booking.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { AdminSeedService } from './admin-seed.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminBookingsController],
  providers: [AdminBookingsService, AdminSeedService],
})
export class AdminModule {}
