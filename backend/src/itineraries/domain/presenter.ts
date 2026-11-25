// PURE: the response shape. Stored fields + fields we compute on the fly (never stored, never stale).
import { groupDaysByCity } from './city-groups.js';

type Plain = Record<string, any>;

/** "First Last" -> trimmed full name, or "Unknown" when the author has no name (e.g. deleted). */
export function authorName(owner?: { firstName?: string; lastName?: string } | null): string {
  const name = `${owner?.firstName ?? ''} ${owner?.lastName ?? ''}`.trim();
  return name || 'Unknown';
}

/** ownerId may be an id, or a populated user { _id, firstName, lastName }. */
function ownerOf(ownerId: unknown): { id: string; name: string } | undefined {
  if (ownerId && typeof ownerId === 'object' && 'firstName' in (ownerId as Plain)) {
    const o = ownerId as Plain;
    return { id: String(o._id), name: authorName(o) };
  }
  return undefined;
}

export function presentItinerary(itinerary: Plain, extra: Plain = {}) {
  const days = (itinerary.days ?? []) as { _id: unknown; cityId: unknown; dayNumber: number; date: Date }[];
  const owner = ownerOf(itinerary.ownerId);
  return {
    ...itinerary,
    ownerId: owner ? owner.id : itinerary.ownerId,
    ...(owner ? { owner } : {}),
    endDate: days.length ? days[days.length - 1].date : null,
    cityGroups: groupDaysByCity(days),
    ...extra,
  };
}