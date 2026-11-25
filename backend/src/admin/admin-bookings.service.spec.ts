import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingType } from '../payments/enums/payment.enums.js';
import { AdminBookingsService } from './admin-bookings.service.js';

describe('AdminBookingsService', () => {
  let service: AdminBookingsService;
  let flightModel: any;
  let hotelModel: any;

  beforeEach(() => {
    flightModel = { find: vi.fn() };
    hotelModel = { find: vi.fn() };
    service = new AdminBookingsService(flightModel, hotelModel);
  });

  it('ACC-17: merges, sorts by createdAt desc, and paginates flight and hotel bookings', async () => {
    const fId = new Types.ObjectId();
    const hId = new Types.ObjectId();
    const uId = new Types.ObjectId();

    flightModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: fId,
            userId: uId,
            status: 'CONFIRMED',
            totalPrice: 300,
            currency: 'USD',
            bookingReference: 'ABC123',
            createdAt: new Date('2026-11-20T10:00:00Z'),
          },
        ]),
      }),
    });

    hotelModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: hId,
            userId: uId,
            hotelId: new Types.ObjectId(),
            status: 'Confirmed',
            totalPrice: 450,
            currency: 'USD',
            createdAt: new Date('2026-11-22T10:00:00Z'),
          },
        ]),
      }),
    });

    const res = await service.listBookings({ page: 1, limit: 10 });
    expect(res.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
    expect(res.data[0].bookingType).toBe(BookingType.Hotel);
    expect(res.data[1].bookingType).toBe(BookingType.Flight);
  });
});
