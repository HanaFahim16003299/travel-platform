// Passenger rules for flight bookings (FLT-12, FLT-19). Pure functions, no `this`.
// Added by Joumana Hozayen.
import { BadRequestException } from '@nestjs/common';
import { PassengerType } from '../flight-booking.enums.js';

export interface PassengerInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date;
  type: PassengerType;
  email?: string;
  phone?: string;
  extraBags?: number;
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

export function validatePassengers(
  passengers: PassengerInput[],
  travelDate: Date,
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

  for (const p of passengers) {
    const name = `${p.firstName} ${p.lastName}`;
    const age = ageOn(new Date(p.dateOfBirth), travelDate);
    if (age < 0)
      throw new BadRequestException(
        `${name}: date of birth is after the flight`,
      );
    const expected = passengerTypeForAge(age);
    if (p.type !== expected)
      throw new BadRequestException(
        `${name} is ${age} on the travel date, so the passenger type must be ${expected}`,
      );
    if (p.type === PassengerType.ADULT && (!p.email || !p.phone))
      throw new BadRequestException(
        `${name}: email and phone are required for adults`,
      );
  }
}
