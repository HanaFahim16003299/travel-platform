import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FlightBookingsService } from './flight-bookings.service.js';

@Injectable()
export class FlightBookingsScheduler {
  constructor(private readonly bookings: FlightBookingsService) {}

  /** FLT-22: holds older than 10 minutes become EXPIRED and release their seats. */
  @Cron(CronExpression.EVERY_MINUTE)
  expireHolds() {
    return this.bookings.expireStaleHolds();
  }

  /** GEN-11: confirmed bookings become COMPLETED after the last flight departs. */
  @Cron(CronExpression.EVERY_HOUR)
  completeDeparted() {
    return this.bookings.completeDeparted();
  }
}
