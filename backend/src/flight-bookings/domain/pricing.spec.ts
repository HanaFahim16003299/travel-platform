// Tests for flight booking pricing (FLT-08, FLT-12). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { PassengerType } from '../flight-booking.enums.js';
import { calculatePrice, round2 } from './pricing.js';

describe('calculatePrice', () => {
  it('charges infants 10% of the fare and no seat price', () => {
    const price = calculatePrice(
      [{ unitPrice: 200, extraBagPrice: 0 }],
      [{ type: PassengerType.ADULT }, { type: PassengerType.INFANT }],
    );
    expect(price).toEqual({ baseFare: 220, baggageFees: 0, totalPrice: 220 });
  });

  it('charges extra bags on each leg', () => {
    const price = calculatePrice(
      [
        { unitPrice: 100, extraBagPrice: 30 },
        { unitPrice: 120, extraBagPrice: 25 },
      ],
      [
        { type: PassengerType.ADULT, extraBags: 2 },
        { type: PassengerType.CHILD, extraBags: 1 },
      ],
    );
    // fares: 2×100 + 2×120 = 440; bags: 3×30 + 3×25 = 165
    expect(price).toEqual({ baseFare: 440, baggageFees: 165, totalPrice: 605 });
  });

  it('rounds to two decimals', () => {
    expect(round2(10.005 + 0.001)).toBe(10.01);
    const price = calculatePrice(
      [{ unitPrice: 99.99, extraBagPrice: 0 }],
      [{ type: PassengerType.ADULT }, { type: PassengerType.INFANT }],
    );
    expect(price.totalPrice).toBe(109.99);
  });
});
