// Flight booking pricing (FLT-08, FLT-12, FLT-19). Pure functions, no `this`.
// Added by Joumana Hozayen.
import { PassengerType } from '../flight-booking.enums.js';

/** FLT-12: infants pay 10% of the fare and take no seat. */
export const INFANT_FARE_FACTOR = 0.1;

export const round2 = (x: number) => Math.round(x * 100) / 100;

export interface PricedLeg {
  unitPrice: number;
  extraBagPrice: number;
}

export interface PricedPassenger {
  type: PassengerType;
  extraBags?: number;
}

export interface BookingPrice {
  baseFare: number;
  baggageFees: number;
  totalPrice: number;
}

/** Per leg: seats × fare + infants × 10% of the fare + extra bags × bag price (bags charged on each leg). */
export function calculatePrice(
  legs: PricedLeg[],
  passengers: PricedPassenger[],
): BookingPrice {
  const seatPax = passengers.filter(
    (p) => p.type !== PassengerType.INFANT,
  ).length;
  const infants = passengers.length - seatPax;
  const bags = passengers.reduce((n, p) => n + (p.extraBags ?? 0), 0);
  let baseFare = 0;
  let baggageFees = 0;
  for (const leg of legs) {
    baseFare +=
      seatPax * leg.unitPrice + infants * INFANT_FARE_FACTOR * leg.unitPrice;
    baggageFees += bags * leg.extraBagPrice;
  }
  return {
    baseFare: round2(baseFare),
    baggageFees: round2(baggageFees),
    totalPrice: round2(baseFare + baggageFees),
  };
}
