import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FlightBookingsService } from './flight-bookings.service.js';
import { SeatHoldService } from './seat-hold.service.js';

@Injectable()
export class FlightBookingsScheduler {
  constructor(
    private readonly bookings: FlightBookingsService,
    private readonly seatHolds: SeatHoldService,
  ) {}

  /** FLT-22: holds older than 10 minutes become EXPIRED and release their seats. */
  @Cron(CronExpression.EVERY_MINUTE)
  expireHolds() {
    return this.bookings.expireStaleHolds();
  }

  /** Review A5: retries seat releases that failed earlier, so seats never leak. Joumana Hozayen. */
  @Cron(CronExpression.EVERY_MINUTE)
  retrySeatReleases() {
    return this.seatHolds.retryPendingReleases();
  }

  /** GEN-11: confirmed bookings become COMPLETED after the last flight departs. */
  @Cron(CronExpression.EVERY_HOUR)
  completeDeparted() {
    return this.bookings.completeDeparted();
  }
}
