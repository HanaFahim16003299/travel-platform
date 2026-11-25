import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ItineraryVisibility } from '../itinerary.constants.js';

/**
 * ItineraryDay is EMBEDDED inside Itinerary (not its own collection):
 * a day only exists inside one itinerary, the list is bounded (MAX_ITINERARY_DAYS),
 * and reordering/renumbering must happen in one atomic save of one document.
 * Each day still gets its own _id, so Hana Fahim's activities/budgets can reference it (dayId).
 */
@Schema() // _id: true by default
export class ItineraryDay {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'City', required: true })
  cityId: Types.ObjectId;

  /** Derived: position in the array + 1. Never sent by the client. */
  @Prop({ required: true, min: 1 })
  dayNumber: number;

  /** Derived: itinerary.startDate + (dayNumber - 1), stored as UTC midnight. */
  @Prop({ required: true })
  date: Date;

  @Prop({ trim: true, maxlength: 120 })
  title?: string;

  @Prop({ trim: true, maxlength: 2000 })
  notes?: string;
}
export const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);

/** ITN-21: a clone remembers where it came from (attribution), even if the original changes later. */
@Schema({ _id: false })
export class ClonedFrom {
  @Prop({ type: Types.ObjectId, ref: 'Itinerary', required: true })
  itineraryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  /** Snapshot of the author's name and the title at clone time. */
  @Prop({ required: true })
  ownerName: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  clonedAt: Date;
}
export const ClonedFromSchema = SchemaFactory.createForClass(ClonedFrom);

// optimisticConcurrency: if two requests edit the same itinerary at once, the second save
// fails with a VersionError (we turn it into 409) instead of silently overwriting the first.
@Schema({ timestamps: true, optimisticConcurrency: true })
export class Itinerary {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 }) // ITN-01: max 100 characters
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Country' }], default: [] })
  countryIds: Types.ObjectId[];

  @Prop({ required: true })
  startDate: Date;

  @Prop({ enum: ItineraryVisibility, default: ItineraryVisibility.Private })
  visibility: ItineraryVisibility;

  @Prop()
  publishedAt?: Date;

  @Prop({ type: [ItineraryDaySchema], default: [] })
  days: ItineraryDay[];

  /** Kept equal to days.length so we can filter/sort public search by trip length. */
  @Prop({ default: 0, min: 0 })
  dayCount: number;

  @Prop({ type: ClonedFromSchema })
  clonedFrom?: ClonedFrom;

  /** GEN-10: set by admin moderation. Hidden = visible only to its author (and admins), never in public search. */
  @Prop({ default: false })
  hidden: boolean;
}

export type ItineraryDocument = HydratedDocument<Itinerary>;
export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);

// "My itineraries", most recently updated first (ITN-03)
ItinerarySchema.index({ ownerId: 1, updatedAt: -1 });
// public search by country / city
ItinerarySchema.index({ visibility: 1, countryIds: 1 });
ItinerarySchema.index({ visibility: 1, 'days.cityId': 1 });