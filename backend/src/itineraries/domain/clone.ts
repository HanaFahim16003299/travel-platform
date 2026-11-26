// PURE: ITN-21 clone with attribution.
// New ids come from a function passed in (`newId`), so this file never touches the database.
import { ItineraryVisibility } from '../itinerary.constants.js';
import type { DayInput } from './days.js';

export interface CloneSource<Id> {
  _id: Id;
  ownerId: Id;
  title: string;
  description?: string;
  countryIds: Id[];
  startDate: Date;
  days: DayInput[];
}

export interface CloneOptions<Id> {
  newOwnerId: Id;
  sourceOwnerName: string;
  title?: string;
  startDate?: Date;
  now: Date;
  newId: () => Id;
}

/**
 * Builds an independent PRIVATE copy (data + days, not yet numbered):
 * - new ids for every day (editing the copy never touches the original),
 * - clonedFrom = a snapshot of the original's id, author and title at clone time (attribution),
 * - dayIdMap = old day id -> new day id, used to copy activities/budgets to the right new day.
 */
export function buildClone<Id>(source: CloneSource<Id>, opts: CloneOptions<Id>) {
  const dayIdMap = new Map<string, Id>();
  const days: DayInput[] = source.days.map((d) => {
    const _id = opts.newId();
    dayIdMap.set(String(d._id), _id);
    return { _id, cityId: d.cityId, title: d.title, notes: d.notes };
  });

  const data = {
    ownerId: opts.newOwnerId,
    title: opts.title ?? source.title,
    description: source.description,
    countryIds: [...source.countryIds],
    startDate: opts.startDate ?? source.startDate,
    visibility: ItineraryVisibility.Private,
    clonedFrom: {
      itineraryId: source._id,
      ownerId: source.ownerId,
      ownerName: opts.sourceOwnerName,
      title: source.title,
      clonedAt: opts.now,
    },
  };
  return { data, days, dayIdMap }; // days are numbered when saved (store.create)
}

/**
 * Copy of one activity / budget entry / transport cost for the clone:
 * drop its own id and timestamps, point it to the new itinerary and to the matching new day.
 */
export function copyChildForClone<Id>(
  child: Record<string, unknown>,
  newItineraryId: Id,
  dayIdMap: Map<string, Id>,
): Record<string, unknown> {
  const { _id, createdAt, updatedAt, __v, ...rest } = child;
  return {
    ...rest,
    itineraryId: newItineraryId,
    ...(rest.dayId ? { dayId: dayIdMap.get(String(rest.dayId)) } : {}),
  };
}