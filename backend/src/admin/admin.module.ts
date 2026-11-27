import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
feature/PAY-01-payments-and-refunds
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema.js';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/schemas/hotel-booking.schema.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { AdminBookingsService } from './admin-bookings.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
  ],
  controllers: [AdminBookingsController],
  providers: [AdminBookingsService],
=======
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AdminSeedService } from './admin-seed.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [AdminSeedService],
 develop
})
export class AdminModule {}
