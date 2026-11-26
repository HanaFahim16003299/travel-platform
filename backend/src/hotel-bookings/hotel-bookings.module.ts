import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  HotelBooking,
  HotelBookingSchema,
} from './schemas/hotel-booking.schema.js';

import { HotelsModule } from '../hotels/hotels.module.js';

import { HotelBookingsController } from './hotel-bookings.controller.js';

import { HotelBookingsService } from './hotel-bookings.service.js';

// Added by Mohamed Hesham: HTL-22 reservations controller and service.
import { HotelReservationsController } from './reservations/hotel-reservations.controller.js';
import { HotelReservationsService } from './reservations/hotel-reservations.service.js';

@Module({
  imports: [
    HotelsModule,

    MongooseModule.forFeature([
      {
        name: HotelBooking.name,
        schema: HotelBookingSchema,
      },
    ]),
  ],

  controllers: [HotelBookingsController, HotelReservationsController],

  providers: [
    HotelBookingsService,
    HotelReservationsService,
  ],

  exports: [HotelBookingsService, MongooseModule],
})
export class HotelBookingsModule {}
