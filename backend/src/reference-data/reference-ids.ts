import { createHash } from 'node:crypto';
import { Types } from 'mongoose';

export type ReferenceKind = 'country' | 'city' | 'airport' | 'attraction';

/**
 * Deterministic MongoDB ObjectId for a reference record, derived from its
 * dataset key (country code, city_id, IATA code or attraction_id).
 *
 * Every teammate's seeded database, and any database that is dropped and
 * seeded again, gets exactly the same _id for the same record. Other modules
 * (flights, hotels, itineraries) can therefore keep storing plain ObjectIds.
 */
export function referenceObjectId(kind: ReferenceKind, key: string): Types.ObjectId {
  const hex = createHash('sha1').update(`${kind}:${key}`).digest('hex').slice(0, 24);
  return new Types.ObjectId(hex);
}
