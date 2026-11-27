// Tests for the e-ticket airport lookup and PDF (FLT-23, review D2). Added by Joumana Hozayen.
import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { ETicketService } from './e-ticket.service.js';
import { PassengerType } from './flight-booking.enums.js';

const cai = new Types.ObjectId();
const lhr = new Types.ObjectId();

function makeService() {
  const lean = vi.fn().mockResolvedValue([
    { _id: cai, iataCode: 'CAI', timeZone: 'Africa/Cairo' },
    { _id: lhr, iataCode: 'LHR', timeZone: 'Europe/London' },
  ]);
  const select = vi.fn().mockReturnValue({ lean });
  const airportModel = { find: vi.fn().mockReturnValue({ select }) };
  return {
    service: new ETicketService(airportModel as never),
    airportModel,
    select,
  };
}

describe('ETicketService (FLT-23)', () => {
  it('reads iataCode and timeZone from the Airport model', async () => {
    const { service, airportModel, select } = makeService();

    const airports = await service.loadAirports([cai, lhr]);

    expect(airportModel.find).toHaveBeenCalledWith({
      _id: { $in: [cai, lhr] },
    });
    expect(select).toHaveBeenCalledWith('iataCode timeZone');
    expect(airports.get(String(cai))).toEqual({
      code: 'CAI',
      timeZone: 'Africa/Cairo',
    });
  });

  it('builds a PDF', async () => {
    const { service } = makeService();
    const pdf = await service.build({
      bookingReference: 'K7M2QX',
      confirmedAt: new Date(),
      totalPrice: 400,
      currency: 'USD',
      segments: [
        {
          flightNumber: 'TA100',
          cabinClass: 'economy',
          departureAirportId: cai,
          arrivalAirportId: lhr,
          departureAt: new Date('2027-02-15T08:00:00Z'),
          arrivalAt: new Date('2027-02-15T13:00:00Z'),
          freeCheckedBags: 1,
          checkedBagWeightKg: 23,
        },
      ],
      passengers: [
        {
          firstName: 'Sara',
          lastName: 'Ali',
          type: PassengerType.ADULT,
          ticketNumber: 'K7M2QX-01',
          extraBags: 0,
        },
      ],
    } as never);

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
