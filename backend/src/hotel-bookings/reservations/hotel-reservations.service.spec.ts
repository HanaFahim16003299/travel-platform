import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { HotelReservationsService } from './hotel-reservations.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import type { QueryHotelReservationsDto } from '../dto/query-hotel-reservations.dto.js';

const HOTEL_ID = 'a'.repeat(24);

function setup(rows: unknown[] = [], total = 0) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(rows),
  };
  const model = {
    find: vi.fn().mockReturnValue(chain),
    countDocuments: vi.fn().mockResolvedValue(total),
  };
  const service = new HotelReservationsService(model as never);
  return { service, model, chain };
}

const q = (extra: object = {}) =>
  ({ page: 1, limit: 10, ...extra }) as QueryHotelReservationsDto;

describe('HotelReservationsService.findForHotel', () => {
  it('hides Expired reservations by default (exact filter, list and count)', async () => {
    const { service, model } = setup();
    await service.findForHotel(HOTEL_ID, q());
    const filter = {
      hotelId: HOTEL_ID,
      status: { $ne: BookingStatus.Expired },
    };
    expect(model.find).toHaveBeenCalledWith(filter);
    expect(model.countDocuments).toHaveBeenCalledWith(filter);
  });

  it('uses the requested status instead of the default exclusion', async () => {
    const { service, model } = setup();
    await service.findForHotel(HOTEL_ID, q({ status: BookingStatus.Expired }));
    expect(model.find).toHaveBeenCalledWith({
      hotelId: HOTEL_ID,
      status: BookingStatus.Expired,
    });
  });

  it('sorts by check-in (newest first) and paginates', async () => {
    const { service, chain } = setup();
    await service.findForHotel(HOTEL_ID, q({ page: 3, limit: 10 }));
    expect(chain.sort).toHaveBeenCalledWith({ checkIn: -1, _id: -1 });
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('returns only the guest name and never payment, policy or refund data', async () => {
    const { service, chain } = setup();
    await service.findForHotel(HOTEL_ID, q());
    expect(chain.populate).toHaveBeenCalledWith('userId', 'firstName lastName');
    const selected = chain.select.mock.calls[0][0] as string;
    for (const secret of ['paymentId', 'policies', 'refund']) {
      expect(selected).not.toContain(secret);
    }
  });

  it('rejects an invalid hotel id without querying', async () => {
    const { service, model } = setup();
    await expect(service.findForHotel('not-an-id', q())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(model.find).not.toHaveBeenCalled();
  });

  it('returns the rows and pagination meta', async () => {
    const rows = [{ _id: '1' }];
    const { service } = setup(rows, 25);
    const result = await service.findForHotel(
      HOTEL_ID,
      q({ page: 2, limit: 10 }),
    );
    expect(result.data).toEqual(rows);
    expect(result.meta).toEqual({
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });
});
