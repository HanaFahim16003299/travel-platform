import type { Connection, Model } from 'mongoose';
import { FlightsService } from './flights.service.js';
import { SearchFlightsDto } from './dto/search-flights.dto.js';
import { AirlineDocument } from '../airlines/schemas/airline.schema.js';
import { FlightDocument } from './schemas/flight.schema.js';

describe('FlightsService', () => {
  const flightModel = {
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };
  const airlineModel = {
    find: vi.fn(),
    findOne: vi.fn(),
  };
  const service = new FlightsService(
    flightModel as unknown as Model<FlightDocument>,
    airlineModel as unknown as Model<AirlineDocument>,
    {} as unknown as Connection,
  );
  const departureAirportId = '507f1f77bcf86cd799439011';
  const arrivalAirportId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    vi.clearAllMocks();
    airlineModel.find.mockReturnValue({
      distinct: vi.fn().mockResolvedValue([]),
    });
    flightModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
  });

  it('searches a departure airport local day across a daylight-saving transition', async () => {
    const query = Object.assign(new SearchFlightsDto(), {
      departureAirportId,
      arrivalAirportId,
      departureDate: '2027-03-14',
      departureTimeZone: 'America/New_York',
    });

    await service.search(query);

    const filter = flightModel.find.mock.calls[0][0];
    expect(filter.departureTime).toEqual({
      $gte: new Date('2027-03-14T05:00:00.000Z'),
      $lt: new Date('2027-03-15T04:00:00.000Z'),
    });
  });

  it('matches seat availability and cabin class within the same cabin', async () => {
    const query = Object.assign(new SearchFlightsDto(), {
      departureAirportId,
      arrivalAirportId,
      cabinClass: 'business',
      passengers: 2,
    });

    await service.search(query);

    const filter = flightModel.find.mock.calls[0][0];
    expect(filter.cabins).toEqual({
      $elemMatch: {
        availableSeats: { $gte: 2 },
        cabinClass: 'business',
      },
    });
  });

  it('atomically guards seat reservations against insufficient inventory', async () => {
    const flightId = '507f1f77bcf86cd799439013';
    const cabinId = '507f1f77bcf86cd799439014';
    const flightAfterFailure = {
      lean: vi.fn().mockResolvedValue({
        status: 'scheduled',
        cabins: [{ _id: cabinId, availableSeats: 1 }],
      }),
    };
    flightModel.findById
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          lean: vi
            .fn()
            .mockResolvedValue({ airlineId: '507f1f77bcf86cd799439015' }),
        }),
      })
      .mockReturnValueOnce(flightAfterFailure);
    airlineModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439015' }),
      }),
    });
    flightModel.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    await expect(service.reserveSeats(flightId, cabinId, 2)).rejects.toThrow(
      'Not enough seats are available',
    );

    expect(
      flightModel.findOneAndUpdate.mock.calls[0][0].cabins.$elemMatch
        .availableSeats,
    ).toEqual({
      $gte: 2,
    });
    expect(flightModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $inc: { 'cabins.$.availableSeats': -2 },
    });
  });
});
