// PURE: ITN-25 / ITN-26 — turn the itinerary's days into a hotel or flight search QUESTION.
// Answering the question is the hotels/flights modules' job, not ours.
import type { CityGroup } from './city-groups.js';
import { addDays } from './dates.js';

// ------------------------------------------------------------------ ITN-25 hotels

export function validateGroupChoice(groupCount: number, group: number): string | null {
  if (groupCount === 0) return 'Add at least one day first';
  if (group < 1 || group > groupCount) return `group must be between 1 and ${groupCount}`;
  return null;
}

/** Check-in = the group's first day; check-out = the day after its last day. */
export function hotelStayFor(group: CityGroup) {
  return { cityId: group.cityId, checkIn: group.startDate, checkOut: addDays(group.endDate, 1) };
}

// ------------------------------------------------------------------ ITN-26 flights

export type TripType = 'one-way' | 'round-trip';

/** Destination = the city of DAY 1. */
export function firstDayCity(days: { cityId: unknown }[]): string | null {
  return days.length ? String(days[0].cityId) : null;
}

/** Departure defaults to the first day's date, return (round-trip only) to the last day's date. */
export function resolveFlightDates(
  days: { date: Date }[],
  tripType: TripType,
  requested: { departureDate?: Date; returnDate?: Date },
): { departureDate: Date; returnDate?: Date } {
  const departureDate = requested.departureDate ?? days[0].date;
  const returnDate = tripType === 'round-trip' ? (requested.returnDate ?? days.at(-1)!.date) : undefined;
  return { departureDate, returnDate };
}

export function validateFlightDates(dates: { departureDate: Date; returnDate?: Date }): string | null {
  return dates.returnDate && dates.returnDate < dates.departureDate
    ? 'returnDate cannot be before departureDate'
    : null;
}

/** Airport documents use different field names in different teams' code; accept the common ones. */
export function timeZoneOf(airport: Record<string, unknown>): string | undefined {
  const tz = airport.timeZone ?? airport.timezone ?? airport.tz ?? airport.ianaTimeZone;
  return typeof tz === 'string' ? tz : undefined;
}