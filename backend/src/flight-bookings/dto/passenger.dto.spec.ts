// Tests for strict date-of-birth validation (FLT-19, review C1). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PassengerDto } from './passenger.dto.js';
import { PassengerType } from '../flight-booking.enums.js';
import { parseDateOfBirth } from '../domain/passenger-rules.js';

const dobErrors = async (dateOfBirth: string) => {
  const dto = plainToInstance(PassengerDto, {
    firstName: 'Sara',
    lastName: 'Ali',
    dateOfBirth,
    documentNumber: 'A1',
    type: PassengerType.ADULT,
  });
  return (await validate(dto)).filter((e) => e.property === 'dateOfBirth');
};

describe('PassengerDto.dateOfBirth (review C1)', () => {
  it('accepts a real date, including 29 February in a leap year', async () => {
    expect(await dobErrors('1998-04-12')).toHaveLength(0);
    expect(await dobErrors('2000-02-29')).toHaveLength(0);
  });

  it('rejects impossible dates instead of rolling them over', async () => {
    expect(await dobErrors('1998-02-30')).not.toHaveLength(0);
    expect(await dobErrors('1999-02-29')).not.toHaveLength(0);
    expect(await dobErrors('1998-13-01')).not.toHaveLength(0);
  });

  it('rejects dates with a time or another format', async () => {
    expect(await dobErrors('1998-04-12T10:00:00Z')).not.toHaveLength(0);
    expect(await dobErrors('12/04/1998')).not.toHaveLength(0);
  });
});

describe('parseDateOfBirth (review C1)', () => {
  it('stores exactly the typed date', () => {
    expect(parseDateOfBirth('1998-04-12').toISOString()).toBe(
      '1998-04-12T00:00:00.000Z',
    );
  });

  it('refuses a date JavaScript would roll over', () => {
    expect(() => parseDateOfBirth('1998-02-30')).toThrow(
      'Invalid date of birth',
    );
  });
});
