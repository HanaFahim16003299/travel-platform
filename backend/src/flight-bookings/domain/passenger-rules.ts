// Passenger rules for flight bookings (FLT-12, FLT-19). Pure functions, no `this`.
// Added by Joumana Hozayen.
import { BadRequestException } from '@nestjs/common';
import { PassengerType } from '../flight-booking.enums.js';

export interface PassengerInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date;
  documentNumber: string;
  type: PassengerType;
  email?: string;
  phone?: string;
  extraBags?: number;
}

/**
 * The typed YYYY-MM-DD date as midnight UTC. Throws if JavaScript would roll an impossible
 * date over (e.g. 1998-02-30), so the stored date always equals the typed date (review C1).
 */
export function parseDateOfBirth(value: string | Date): Date {
  if (value instanceof Date) return value;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    throw new BadRequestException(`Invalid date of birth: ${value}`);
  return date;
}

/** Full years between the date of birth and `on`, both compared in UTC. */
export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Assumption documented for the team: infant under 2, child 2–11, adult 12+. */
export function passengerTypeForAge(age: number): PassengerType {
  if (age < 2) return PassengerType.INFANT;
  if (age < 12) return PassengerType.CHILD;
  return PassengerType.ADULT;
}

export function seatCountFor(
  passengers: Pick<PassengerInput, 'type'>[],
): number {
  return passengers.filter((p) => p.type !== PassengerType.INFANT).length;
}

/**
 * FLT-12 / FLT-19 passenger rules, checked against the departure date of EVERY leg
 * (review C2, Joumana Hozayen):
 *  - at least one adult, and no more infants than adults;
 *  - each passenger's type must match their age on each leg's date. A passenger whose
 *    type changes between legs (e.g. a child who turns 12 before the return flight) is
 *    rejected with a message to book the legs separately, because one booking holds one
 *    type, one fare rule and one seat count per passenger;
 *  - no two passengers with the same passport/ID number.
 * Team decision: FLT-19 only asks for full name, date of birth and passport/ID, so email
 * and phone are optional for every passenger (the earlier "required for adults" rule was
 * extra and has been removed).
 */
export function validatePassengers(
  passengers: PassengerInput[],
  legDates: Date[],
): void {
  const adults = passengers.filter(
    (p) => p.type === PassengerType.ADULT,
  ).length;
  const infants = passengers.filter(
    (p) => p.type === PassengerType.INFANT,
  ).length;
  if (adults === 0)
    throw new BadRequestException('At least one adult is required');
  // Infants sit on an adult's lap, so at most one infant per adult (documented assumption)
  if (infants > adults)
    throw new BadRequestException('Each infant must travel with an adult');

  const documents = new Set<string>();
  for (const p of passengers) {
    const name = `${p.firstName} ${p.lastName}`;
    const document = p.documentNumber.trim().toUpperCase();
    if (documents.has(document))
      throw new BadRequestException(
        `Passport/ID number ${p.documentNumber} is used by more than one passenger`,
      );
    documents.add(document);

    const dob = parseDateOfBirth(p.dateOfBirth);
    legDates.forEach((legDate, leg) => {
      const flight = leg === 0 ? 'outbound flight' : 'return flight';
      const age = ageOn(dob, legDate);
      if (age < 0)
        throw new BadRequestException(
          `${name}: date of birth is after the ${flight}`,
        );
      const expected = passengerTypeForAge(age);
      if (p.type === expected) return;
      if (leg === 0)
        throw new BadRequestException(
          `${name} is ${age} on the travel date, so the passenger type must be ${expected}`,
        );
      throw new BadRequestException(
        `${name} is ${p.type} on the outbound flight but ${expected} on the return flight; please book the two flights separately`,
      );
    });
  }
}
