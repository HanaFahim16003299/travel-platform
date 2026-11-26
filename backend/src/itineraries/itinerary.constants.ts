// Shared constants for the itineraries feature (ITN-*).

export enum ItineraryVisibility {
  Private = 'private',
  Public = 'public',
}

/** ITN-05: an itinerary can have at most 60 days. */
export const MAX_ITINERARY_DAYS = 60;

/**
 * Collections owned by Hana Fahim's second phase (ITN-10 to ITN-18) that hang off an itinerary.
 * Agreed contract: every document in them stores `itineraryId`, and day-level ones also store `dayId`.
 * When a day or itinerary is deleted or cloned, this module cleans up / copies those documents.
 * If a model is not registered yet (not merged), it is simply skipped, so nothing crashes.
 */
export const ITINERARY_CHILD_MODELS = ['Activity', 'BudgetEntry', 'TransportCost'] as const;

/** Key each child list gets in the itinerary detail response (ITN-21: view shows activities and budget). */
export const ITINERARY_CHILD_KEYS: Record<(typeof ITINERARY_CHILD_MODELS)[number], string> = {
  Activity: 'activities',
  BudgetEntry: 'budgetEntries',
  TransportCost: 'transportCosts',
};

/** The only date format the API accepts in requests (ITN-01 startDate, ITN-26 travel dates). */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Fields a client may sort by on list/search endpoints. */
export const ITINERARY_SORT_FIELDS = ['createdAt', 'updatedAt', 'startDate', 'title', 'dayCount'] as const;