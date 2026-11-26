import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthUser } from '../../auth/decorators.js';
import { MAX_ITINERARY_DAYS } from '../itinerary.constants.js';
import { AddDayDto, ReorderDaysDto, UpdateDayDto } from '../dto/day.dto.js';
import type { ItineraryDocument } from '../schemas/itinerary.schema.js';
import {
  type DayInput,
  findDayIndex,
  insertDay,
  removeDay,
  reorderDays,
  updateDay,
  validateAddDay,
  validateReorder,
} from '../domain/days.js';
import { presentItinerary } from '../domain/presenter.js';
import { ItineraryStore } from '../shared/itinerary-store.service.js';
import { assertObjectId, rejectIf } from '../shared/http-guards.js';

/**
 * ITN-05 / ITN-07 / ITN-08 days. Every method has the same 4 steps:
 *   1. load + ownership check         store.loadOwned
 *   2. compute the new days list      pure function from domain/days.ts
 *   3. renumber + dayCount + save     store.saveDays
 *   4. return with cityGroups         presentItinerary (pure)
 */
@Injectable()
export class ItineraryDaysService {
  constructor(private readonly store: ItineraryStore) {}

  // ITN-05 add a day (append, or insert at "position")
  async addDay(user: AuthUser, itineraryId: string, dto: AddDayDto) {
    const { itinerary, days } = await this.load(itineraryId, user);
    rejectIf(validateAddDay(days.length, MAX_ITINERARY_DAYS, dto.position));
    await this.store.assertReferencesExist('City', [dto.cityId]);

    const newDay = { _id: new Types.ObjectId(), cityId: new Types.ObjectId(dto.cityId), title: dto.title, notes: dto.notes };
    return this.commit(itinerary, insertDay(days, newDay, dto.position));
  }

  // ITN-05 edit a day's city / title / notes
  async updateDay(user: AuthUser, itineraryId: string, dayId: string, dto: UpdateDayDto) {
    const { itinerary, days } = await this.load(itineraryId, user);
    this.assertDayExists(days, dayId);
    if (dto.cityId) await this.store.assertReferencesExist('City', [dto.cityId]);

    const changes = { ...dto, cityId: dto.cityId ? new Types.ObjectId(dto.cityId) : undefined };
    return this.commit(itinerary, updateDay(days, dayId, changes));
  }

  // ITN-07 delete a day -> later days move up one number and one date
  async deleteDay(user: AuthUser, itineraryId: string, dayId: string) {
    const { itinerary, days } = await this.load(itineraryId, user);
    this.assertDayExists(days, dayId);

    const result = await this.commit(itinerary, removeDay(days, dayId));
    await this.store.deleteChildren({ dayId: new Types.ObjectId(dayId) }); // that day's activities/budgets
    return result;
  }

  // ITN-08 reorder: the client sends ALL day ids in the new order
  async reorderDays(user: AuthUser, itineraryId: string, dto: ReorderDaysDto) {
    const { itinerary, days } = await this.load(itineraryId, user);
    rejectIf(validateReorder(days, dto.dayIds));
    return this.commit(itinerary, reorderDays(days, dto.dayIds));
  }

  // ------------------------------------------------------------------ helpers

  /** Step 1, shared: the owner's itinerary + its days as plain objects for the pure functions. */
  private async load(itineraryId: string, user: AuthUser) {
    const itinerary = await this.store.loadOwned(itineraryId, user);
    return { itinerary, days: this.store.plainDays(itinerary) };
  }

  /** Steps 3 + 4, shared by every method so they can't drift apart. */
  private async commit(itinerary: ItineraryDocument, days: DayInput[]) {
    await this.store.saveDays(itinerary, days);
    return presentItinerary(itinerary.toObject());
  }

    private assertDayExists(days: DayInput[], dayId: string) {
    assertObjectId(dayId, 'dayId');
    if (findDayIndex(days, dayId) === -1) throw new NotFoundException('Day not found in this itinerary');
  }
}