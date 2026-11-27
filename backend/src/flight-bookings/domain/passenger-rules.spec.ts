// Tests for the flight booking passenger rules (FLT-12, FLT-19). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PassengerType } from '../flight-booking.enums.js';
import {
  ageOn,
  passengerTypeForAge,
  seatCountFor,
  validatePassengers,
  type PassengerInput,
} from './passenger-rules.js';

const TRAVEL = new Date('2027-02-15T10:00:00Z');
const adult = (over: Partial<PassengerInput> = {}): PassengerInput => ({
  firstName: 'Sara',
  lastName: 'Ali',
  dateOfBirth: '1990-01-01',
  documentNumber: 'A1',
  type: PassengerType.ADULT,
  email: 'sara@test.com',
  phone: '0100',
  ...over,
});
const child: PassengerInput = {
  documentNumber: 'C1',
  firstName: 'Omar',
  lastName: 'Ali',
  dateOfBirth: '2020-01-01',
  type: PassengerType.CHILD,
};
const infant: PassengerInput = {
  documentNumber: 'I1',
  firstName: 'Lina',
  lastName: 'Ali',
  dateOfBirth: '2026-01-01',
  type: PassengerType.INFANT,
};

describe('passenger rules', () => {
  it('ageOn counts full years and is exact on the birthday', () => {
    expect(ageOn(new Date('2015-02-15'), TRAVEL)).toBe(12);
    expect(ageOn(new Date('2015-02-16'), TRAVEL)).toBe(11);
  });

  it('maps ages to infant, child and adult', () => {
    expect(passengerTypeForAge(1)).toBe(PassengerType.INFANT);
    expect(passengerTypeForAge(2)).toBe(PassengerType.CHILD);
    expect(passengerTypeForAge(11)).toBe(PassengerType.CHILD);
    expect(passengerTypeForAge(12)).toBe(PassengerType.ADULT);
  });

  it('infants take no seat', () => {
    expect(seatCountFor([adult(), child, infant])).toBe(2);
  });

  it('accepts a family with matching types', () => {
    expect(() =>
      validatePassengers([adult(), child, infant], [TRAVEL]),
    ).not.toThrow();
  });

  it('requires at least one adult', () => {
    expect(() => validatePassengers([child], [TRAVEL])).toThrow(
      'At least one adult',
    );
  });

  it('rejects more infants than adults', () => {
    expect(() =>
      validatePassengers(
        [adult(), infant, { ...infant, firstName: 'Mona' }],
        [TRAVEL],
      ),
    ).toThrow('Each infant must travel with an adult');
  });

  it('rejects a type that does not match the age on the travel date', () => {
    expect(() =>
      validatePassengers(
        [adult(), { ...child, dateOfBirth: '2010-01-01' }],
        [TRAVEL],
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a date of birth after the flight', () => {
    expect(() =>
      validatePassengers(
        [adult(), { ...infant, dateOfBirth: '2028-01-01' }],
        [TRAVEL],
      ),
    ).toThrow('date of birth is after the outbound flight');
  });

  describe('review C2', () => {
    const RETURN = new Date('2027-03-20T10:00:00Z');

    it('rejects a child who is already 12 on the return flight', () => {
      const turnsTwelve = { ...child, dateOfBirth: '2015-03-01' }; // 11 on 15 Feb, 12 on 20 Mar
      expect(() =>
        validatePassengers([adult(), turnsTwelve], [TRAVEL, RETURN]),
      ).toThrow('CHILD on the outbound flight but ADULT on the return flight');
    });

    it('accepts a round trip when the types stay the same on both legs', () => {
      expect(() =>
        validatePassengers([adult(), child, infant], [TRAVEL, RETURN]),
      ).not.toThrow();
    });

    it('rejects the same passport/ID number twice, ignoring case and spaces', () => {
      expect(() =>
        validatePassengers(
          [
            adult({ documentNumber: 'ab123' }),
            adult({ firstName: 'Mona', documentNumber: ' AB123 ' }),
          ],
          [TRAVEL],
        ),
      ).toThrow('used by more than one passenger');
    });

    it('does not require email or phone (FLT-19 asks only for name, birth date and passport/ID)', () => {
      expect(() =>
        validatePassengers(
          [adult({ email: undefined, phone: undefined })],
          [TRAVEL],
        ),
      ).not.toThrow();
    });
  });
});
