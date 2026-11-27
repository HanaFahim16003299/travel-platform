// GEN-05: the flight bookings list returns at most 10 per page (review C6). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListFlightBookingsQueryDto } from './list-flight-bookings.query.dto.js';

const limitErrors = async (query: object) =>
  (await validate(plainToInstance(ListFlightBookingsQueryDto, query))).filter(
    (e) => e.property === 'limit',
  );

describe('ListFlightBookingsQueryDto (GEN-05)', () => {
  it('defaults to 10 per page', () => {
    expect(plainToInstance(ListFlightBookingsQueryDto, {}).limit).toBe(10);
  });

  it('accepts up to 10 and rejects more', async () => {
    expect(await limitErrors({ limit: '10' })).toHaveLength(0);
    expect(await limitErrors({ limit: '11' })).not.toHaveLength(0);
    expect(await limitErrors({ limit: '50' })).not.toHaveLength(0);
  });
});
