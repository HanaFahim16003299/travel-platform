import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  HotelBooking,
  HotelBookingSchema,
} from './schemas/hotel-booking.schema.js';

import { HotelsModule } from '../hotels/hotels.module.js';

import { HotelBookingsController } from './hotel-bookings.controller.js';

import { HotelBookingsService } from './hotel-bookings.service.js';
import { HotelBookingsScheduler } from './hotel-bookings.scheduler.js';

import { HotelReservationsController } from './reservations/hotel-reservations.controller.js';
import { HotelReservationsService } from './reservations/hotel-reservations.service.js';

@Module({
  imports: [
    HotelsModule,
    // NotificationsModule is @Global, so no import is needed for it.

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
    HotelBookingsScheduler,
    HotelReservationsService,
  ],

  exports: [HotelBookingsService, MongooseModule],
})
export class HotelBookingsModule {}
