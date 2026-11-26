// PURE: ITN-20 private / public.
import { ItineraryVisibility } from '../itinerary.constants.js';

/**
 * What the visibility fields become.
 * publishedAt is set when a trip becomes public and cleared when it becomes private again.
 * `now` is passed in (not read from the clock) so the function stays pure and testable.
 */
export function applyVisibility(
  current: { visibility: ItineraryVisibility; publishedAt?: Date },
  next: ItineraryVisibility | undefined,
  now: Date,
): { visibility: ItineraryVisibility; publishedAt?: Date } {
  if (next === undefined || next === current.visibility) return current;
  return { visibility: next, publishedAt: next === ItineraryVisibility.Public ? now : undefined };
}

/** Default for a new itinerary: private (ITN-01). */
export function initialVisibility(requested: ItineraryVisibility | undefined, now: Date) {
  return applyVisibility({ visibility: ItineraryVisibility.Private }, requested, now);
}