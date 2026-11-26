// FLT-06: cancelling a flight notifies the flight-cancellation listeners. Added by Joumana Hozayen (review A3).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { FlightsService } from './flights.service.js';
import { FlightCancellationHooks } from './flight-cancellation.hooks.js';
import { FlightStatus } from './schemas/flight.schema.js';

const admin = { id: 'admin', email: 'a@test.com', role: 'admin' } as never;

describe('FlightsService.cancel (FLT-06)', () => {
  const flightId = new Types.ObjectId().toString();
  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let hooks: FlightCancellationHooks;
  let listener: {
    onFlightCancelled: ReturnType<
      typeof vi.fn<(id: string) => Promise<unknown>>
    >;
  };
  let service: FlightsService;

  beforeEach(() => {
    flightModel = { findById: vi.fn(), findByIdAndUpdate: vi.fn() };
    hooks = new FlightCancellationHooks();
    listener = {
      onFlightCancelled: vi
        .fn<(id: string) => Promise<unknown>>()
        .mockResolvedValue(undefined),
    };
    hooks.register(listener);
    service = new FlightsService(
      flightModel as never,
      {} as never,
      {} as never,
      hooks,
    );
  });

  it('tells the listeners (flight bookings) after cancelling a scheduled flight', async () => {
    flightModel.findById.mockResolvedValue({
      _id: flightId,
      airlineId: 'x',
      status: FlightStatus.Scheduled,
    });
    flightModel.findByIdAndUpdate.mockResolvedValue({
      _id: flightId,
      status: FlightStatus.Cancelled,
    });

    await service.cancel(flightId, admin);

    expect(listener.onFlightCancelled).toHaveBeenCalledWith(flightId);
  });

  it('does not notify again for a flight that is already cancelled', async () => {
    flightModel.findById.mockResolvedValue({
      _id: flightId,
      airlineId: 'x',
      status: FlightStatus.Cancelled,
    });

    await service.cancel(flightId, admin);

    expect(listener.onFlightCancelled).not.toHaveBeenCalled();
  });
});
