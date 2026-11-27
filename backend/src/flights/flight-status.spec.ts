// FLT-30: flights become Departed and only Scheduled flights can change. Added by Joumana Hozayen (review C7).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { FlightsService } from './flights.service.js';
import { FlightsScheduler } from './flights.scheduler.js';
import { FlightStatus } from './schemas/flight.schema.js';

const admin = { id: 'admin', email: 'a@test.com', role: 'admin' } as never;

describe('Departed flight status (FLT-30)', () => {
  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let service: FlightsService;

  beforeEach(() => {
    flightModel = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    };
    service = new FlightsService(
      flightModel as never,
      {} as never,
      {} as never,
    );
  });

  it('marks scheduled flights whose departure time has passed as Departed', async () => {
    const now = new Date('2027-01-01T12:00:00Z');

    expect(await service.markDepartedFlights(now)).toBe(3);
    expect(flightModel.updateMany).toHaveBeenCalledWith(
      { status: FlightStatus.Scheduled, departureTime: { $lte: now } },
      { $set: { status: FlightStatus.Departed } },
    );
  });

  it('runs from the scheduler', async () => {
    const markDepartedFlights = vi.fn().mockResolvedValue(0);
    await new FlightsScheduler({ markDepartedFlights } as never).markDeparted();
    expect(markDepartedFlights).toHaveBeenCalled();
  });

  it('refuses to edit a departed flight', async () => {
    flightModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      airlineId: 'x',
      status: FlightStatus.Departed,
    });

    await expect(
      service.update('6b0930e11aab2d1255abeac1', {} as never, admin),
    ).rejects.toThrow('Only scheduled flights can be changed');
  });

  it('refuses to cancel a departed flight', async () => {
    flightModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      airlineId: 'x',
      status: FlightStatus.Departed,
    });

    await expect(
      service.cancel('6b0930e11aab2d1255abeac1', admin),
    ).rejects.toThrow('Departed flights cannot be cancelled');
    expect(flightModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
