import { Injectable, NotFoundException } from '@nestjs/common';
import { ItineraryStore } from '../shared/itinerary-store.service.js';
import { assertObjectId } from '../shared/http-guards.js';
import { presentItinerary } from '../domain/presenter.js';

/**
 * GEN-10 admin moderation of itineraries. No controller here on purpose:
 * Mohamed Elhamy's admin report review calls these methods (and writes the audit log).
 */
@Injectable()
export class ItineraryModerationService {
  constructor(private readonly store: ItineraryStore) {}

  /** Hide or unhide. Hidden = gone from public search/view, still visible to its author. */
  async setHidden(id: string, hidden: boolean) {
    assertObjectId(id);
    const itinerary = await this.store.model.findByIdAndUpdate(id, { $set: { hidden } }, { new: true }).lean();
    if (!itinerary) throw new NotFoundException('Itinerary not found');
    return presentItinerary(itinerary);
  }

  /** Delete with its activities/budgets. Clones made by others are separate and stay. */
  async remove(id: string) {
    assertObjectId(id);
    const itinerary = await this.store.model.findById(id);
    if (!itinerary) throw new NotFoundException('Itinerary not found');
    return this.store.deleteWithChildren(itinerary._id);
  }

  /** GEN-09: a report may only target an itinerary that is publicly visible (404 otherwise). */
  async assertReportable(id: string) {
    await this.store.loadPublic(id);
  }
}
//What it does: when an admin reviews a report about an itinerary, they can hide it (it disappears from public search and view, through your visibleFilter) or delete it. assertReportable makes sure people can only report trips that are actually public.