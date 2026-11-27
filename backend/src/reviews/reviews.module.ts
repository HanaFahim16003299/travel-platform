
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Review,
  ReviewSchema,
} from './schemas/review.schema.js';

import {
  HotelBookingsModule,
} from '../hotel-bookings/hotel-bookings.module.js';

import {
  HotelsModule,
} from '../hotels/hotels.module.js';

import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [
    HotelBookingsModule,
    HotelsModule,

    MongooseModule.forFeature([
      {
        name: Review.name,
        schema: ReviewSchema,
      },
    ]),
  ],

  controllers: [ReviewsController],

  providers: [ReviewsService],

  exports: [
    ReviewsService,
    MongooseModule,
  ],
})
export class ReviewsModule {}
