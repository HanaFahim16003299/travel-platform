import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  HotelBooking,
  HotelBookingSchema,
} from './schemas/hotel-booking.schema.js';

import { HotelsModule } from '../hotels/hotels.module.js';

import {
  HotelBookingsController,
} from './hotel-bookings.controller.js';

import {
  HotelBookingsService,
} from './hotel-bookings.service.js';

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

  controllers: [HotelBookingsController],

  providers: [HotelBookingsService],

  exports: [
    HotelBookingsService,
    MongooseModule,
  ],
})
export class HotelBookingsModule {}