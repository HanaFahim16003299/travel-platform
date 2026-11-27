import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
 fix/flight-bookings-review
import {
  FlightBooking,
  FlightBookingSchema,
} from '../flight-bookings/schemas/flight-booking.schema.js';
import {
  HotelBooking,
  HotelBookingSchema,
} from '../hotel-bookings/schemas/hotel-booking.schema.js';

import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema.js';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/schemas/hotel-booking.schema.js';
develop
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { AdminSeedService } from './admin-seed.service.js';

// Both sides of the payments/GEN-12 merge kept (the committed file still had conflict
// markers). Fixed by Joumana Hozayen.
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
