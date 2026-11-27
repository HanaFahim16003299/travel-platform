// FLT-29: moderator booking list and passenger export. Added by Joumana Hozayen (review A4).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { FlightsService } from './flights.service.js';
import { FlightStatus } from './schemas/flight.schema.js';
import {
  FlightBookingStatus,
  PassengerType,
} from '../flight-bookings/flight-booking.enums.js';

const admin = { id: 'admin', email: 'a@test.com', role: 'admin' } as never;

describe('FlightsService moderator views (FLT-29)', () => {
  const outboundId = new Types.ObjectId();
  const returnId = new Types.ObjectId();
  const booking = {
    _id: new Types.ObjectId(),
    bookingReference: 'K7M2QX',
    status: FlightBookingStatus.CONFIRMED,
    seatCount: 1,
    segments: [
      {
        flightId: outboundId,
        flightNumber: 'TA100',
        cabinClass: 'economy',
        departureAt: new Date(),
        arrivalAt: new Date(),
      },
      {
        flightId: returnId,
        flightNumber: 'TA101',
        cabinClass: 'business',
        departureAt: new Date(),
        arrivalAt: new Date(),
      },
    ],
    passengers: [
      {
        firstName: 'Sara',
        lastName: 'Ali',
        type: PassengerType.ADULT,
        ticketNumber: 'K7M2QX-01',
        documentNumber: 'SECRET-PASSPORT',
        email: 'sara@test.com',
        phone: '0100',
      },
    ],
  };
  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let bookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let service: FlightsService;

  beforeEach(() => {
    flightModel = {
      findById: vi.fn().mockResolvedValue({
        _id: returnId,
        airlineId: 'x',
        status: FlightStatus.Scheduled,
      }),
    };
    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([booking]),
    };
    bookingModel = {
      find: vi.fn().mockReturnValue(query),
      countDocuments: vi.fn().mockResolvedValue(1),
    };
    service = new FlightsService(
      flightModel as never,
      {} as never,
      bookingModel as never,
    );
  });

  it('finds bookings by any leg and only Confirmed or Cancelled ones', async () => {
    await service.bookings(String(returnId), admin, {
      page: 1,
      limit: 10,
    } as never);

    expect(bookingModel.find).toHaveBeenCalledWith({
      'segments.flightId': returnId,
      status: {
        $in: [FlightBookingStatus.CONFIRMED, FlightBookingStatus.CANCELLED],
      },
    });
  });

  it('returns reference, names, cabin of this leg, seats and status, without personal data', async () => {
    const result = await service.bookings(String(returnId), admin, {
      page: 1,
      limit: 10,
    } as never);

    expect(result.data[0]).toEqual({
      id: String(booking._id),
      bookingReference: 'K7M2QX',
      status: FlightBookingStatus.CONFIRMED,
      cabin: 'business',
      seats: 1,
      passengers: [
        {
          firstName: 'Sara',
          lastName: 'Ali',
          type: PassengerType.ADULT,
          ticketNumber: 'K7M2QX-01',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('SECRET-PASSPORT');
    expect(JSON.stringify(result)).not.toContain('sara@test.com');
  });

  it('exports a CSV with booking reference, status, cabin and seats columns', async () => {
    const response = { setHeader: vi.fn(), send: vi.fn() };

    await service.exportPassengers(
      String(outboundId),
      admin,
      response as never,
    );

    const csv: string = response.send.mock.calls[0][0];
    const [header, row] = csv.split('\r\n');
    expect(header).toBe(
      'bookingReference,status,cabin,seats,firstName,lastName,type,ticketNumber',
    );
    expect(row).toBe(
      '"K7M2QX","CONFIRMED","economy","1","Sara","Ali","ADULT","K7M2QX-01"',
    );
    expect(csv).not.toContain('SECRET-PASSPORT');
  });
});
