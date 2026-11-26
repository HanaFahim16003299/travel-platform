import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HotelBookingsService } from './hotel-bookings.service.js';

@Injectable()
export class HotelBookingsScheduler {
  constructor(private readonly bookings: HotelBookingsService) {}

  /** HTL-23: confirmed bookings become Completed once their check-out date has passed. */
  @Cron(CronExpression.EVERY_HOUR)
  completeDeparted() {
    return this.bookings.completeDeparted();
  }
}
