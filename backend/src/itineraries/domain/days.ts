// PURE: every function returns a NEW array and never changes the one it was given.
// Validators return an error message (string) or null when everything is fine.
// The service decides what HTTP error a message becomes; these functions know nothing about HTTP.

import { addDays } from './dates.js';

/** What a day looks like before numbering. `_id` may be an ObjectId or a string: we only compare String(_id). */
export interface DayInput {
  _id: unknown;
  cityId: unknown;
  title?: string;
  notes?: string;
}

/** A day after numbering: dayNumber and date are always derived, never typed by the user. */
export interface Day extends DayInput {
  dayNumber: number;
  date: Date;
}

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/**
 * ITN-05/07/08 — the heart of the feature.
 * Day N is on startDate + (N - 1). Call after ANY change to the order or to the start date.
 */
export function renumberDays<T extends DayInput>(days: T[], startDate: Date): (T & Day)[] {
  return days.map((day, index) => ({ ...day, dayNumber: index + 1, date: addDays(startDate, index) }));
}

/** Position of a day in the list, or -1 if it is not there. */
export function findDayIndex(days: DayInput[], dayId: string): number {
  return days.findIndex((d) => sameId(d._id, dayId));
}

// ------------------------------------------------------------------ add (ITN-05)

export function validateAddDay(currentCount: number, maxDays: number, position?: number): string | null {
  if (currentCount >= maxDays) return `An itinerary can have at most ${maxDays} days`;
  if (position !== undefined && (position < 1 || position > currentCount + 1))
    return `position must be between 1 and ${currentCount + 1}`;
  return null;
}

/** Insert at a 1-based position, or append when no position is given. */
export function insertDay<T extends DayInput>(days: T[], newDay: T, position?: number): T[] {
  const index = position === undefined ? days.length : position - 1;
  return [...days.slice(0, index), newDay, ...days.slice(index)];
}

// ------------------------------------------------------------------ edit (ITN-05)

export function updateDay<T extends DayInput>(
  days: T[],
  dayId: string,
  changes: Partial<Pick<DayInput, 'cityId' | 'title' | 'notes'>>,
): T[] {
  // only copy fields that were actually sent, so "not sent" never erases a value
  const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
  return days.map((d) => (sameId(d._id, dayId) ? { ...d, ...defined } : d));
}

// ------------------------------------------------------------------ delete (ITN-07)

export function removeDay<T extends DayInput>(days: T[], dayId: string): T[] {
  return days.filter((d) => !sameId(d._id, dayId));
}

// ------------------------------------------------------------------ reorder (ITN-08)

/** The new order must contain every existing day exactly once — no missing, extra or repeated ids. */
export function validateReorder(days: DayInput[], orderedIds: string[]): string | null {
  const existing = new Set(days.map((d) => String(d._id)));
  const isPermutation =
    orderedIds.length === days.length &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((id) => existing.has(id));
  return isPermutation ? null : 'dayIds must list every day of this itinerary exactly once';
}

export function reorderDays<T extends DayInput>(days: T[], orderedIds: string[]): T[] {
  const byId = new Map(days.map((d) => [String(d._id), d]));
  return orderedIds.map((id) => byId.get(id)!);
}