// FLT-30: marks flights Departed once their departure time has passed.
// Added by Joumana Hozayen (review C7).
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FlightsService } from './flights.service.js';

@Injectable()
export class FlightsScheduler {
  private readonly logger = new Logger(FlightsScheduler.name);

  constructor(private readonly flights: FlightsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async markDeparted() {
    const count = await this.flights.markDepartedFlights();
    if (count) this.logger.log(`Marked ${count} flight(s) as departed`);
  }
}
