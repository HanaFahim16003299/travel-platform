// Lets other modules react when an airline cancels a flight (FLT-06) without the flights
// module importing them, so there is no circular import. Added by Joumana Hozayen (review A3).
import { Injectable } from '@nestjs/common';

export interface FlightCancellationListener {
  onFlightCancelled(flightId: string): Promise<unknown>;
}

@Injectable()
export class FlightCancellationHooks {
  private readonly listeners: FlightCancellationListener[] = [];

  register(listener: FlightCancellationListener): void {
    this.listeners.push(listener);
  }

  /** Runs every listener in order; a failing listener stops the cancellation response with its error. */
  async notifyCancelled(flightId: string): Promise<void> {
    for (const listener of this.listeners)
      await listener.onFlightCancelled(flightId);
  }
}
