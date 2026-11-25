import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsModule } from '../payments/payments.module.js';

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
    forwardRef(() => PaymentsModule),

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