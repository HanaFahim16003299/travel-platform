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
  type: PassengerType.ADULT,
  email: 'sara@test.com',
  phone: '0100',
  ...over,
});
const child: PassengerInput = {
  firstName: 'Omar',
  lastName: 'Ali',
  dateOfBirth: '2020-01-01',
  type: PassengerType.CHILD,
};
const infant: PassengerInput = {
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
      validatePassengers([adult(), child, infant], TRAVEL),
    ).not.toThrow();
  });

  it('requires at least one adult', () => {
    expect(() => validatePassengers([child], TRAVEL)).toThrow(
      'At least one adult',
    );
  });

  it('rejects more infants than adults', () => {
    expect(() =>
      validatePassengers(
        [adult(), infant, { ...infant, firstName: 'Mona' }],
        TRAVEL,
      ),
    ).toThrow('Each infant must travel with an adult');
  });

  it('rejects a type that does not match the age on the travel date', () => {
    expect(() =>
      validatePassengers(
        [adult(), { ...child, dateOfBirth: '2010-01-01' }],
        TRAVEL,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a date of birth after the flight', () => {
    expect(() =>
      validatePassengers(
        [adult(), { ...infant, dateOfBirth: '2028-01-01' }],
        TRAVEL,
      ),
    ).toThrow('date of birth is after the flight');
  });
});
