import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthUser } from '../../auth/decorators.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ITINERARY_SORT_FIELDS } from '../itinerary.constants.js';
import { CreateItineraryDto, UpdateItineraryDto } from '../dto/itinerary.dto.js';
import { applyVisibility, initialVisibility } from '../domain/visibility.js';
import { buildSort, validateSort } from '../domain/search.js';
import { presentItinerary } from '../domain/presenter.js';
import { ItineraryStore } from '../shared/itinerary-store.service.js';
import { parseDay, rejectIf } from '../shared/http-guards.js';

/**
 * ITN-01 / ITN-03 / ITN-20: my itineraries.
 * Each method = load (store) -> decide (pure functions) -> save (store) -> present (pure).
 */
@Injectable()
export class ItinerariesService {
  constructor(private readonly store: ItineraryStore) {}

  // ITN-01 create (private by default)
  async create(user: AuthUser, dto: CreateItineraryDto) {
    const startDate = parseDay(dto.startDate, 'startDate');
    await this.store.assertReferencesExist('Country', dto.countryIds);
    await this.store.assertReferencesExist('City', (dto.days ?? []).map((d) => d.cityId));

    const days = (dto.days ?? []).map((d) => ({ _id: new Types.ObjectId(), ...d }));
    const itinerary = await this.store.create(
      {
        ownerId: new Types.ObjectId(user.id),
        title: dto.title,
        description: dto.description,
        countryIds: dto.countryIds,
        startDate,
        ...initialVisibility(dto.visibility, new Date()),
      },
      days, // numbered + dated inside store.create
    );
    return presentItinerary(itinerary.toObject());
  }

  // ITN-03 list mine, most recently updated first
  async findMine(user: AuthUser, query: PaginationQueryDto) {
    rejectIf(validateSort(query.sort, ITINERARY_SORT_FIELDS));
    const sort = buildSort(query.sort, query.order, { updatedAt: -1 });
    return this.store.page({ ownerId: new Types.ObjectId(user.id) }, sort, query.page, query.limit);
  }

  // ITN-03 view one of mine (with activities and budgets once they exist)
  async findMineById(user: AuthUser, id: string) {
    const itinerary = await this.store.loadOwned(id, user);
    return presentItinerary(itinerary.toObject(), await this.store.loadChildren(itinerary._id));
  }

  // ITN-01 edit / ITN-20 publish or unpublish
  async update(user: AuthUser, id: string, dto: UpdateItineraryDto) {
    const itinerary = await this.store.loadOwned(id, user);
    if (dto.countryIds) await this.store.assertReferencesExist('Country', dto.countryIds);

    if (dto.title !== undefined) itinerary.title = dto.title;
    if (dto.description !== undefined) itinerary.description = dto.description;
    if (dto.countryIds !== undefined) itinerary.set('countryIds', dto.countryIds);
    if (dto.startDate !== undefined) itinerary.startDate = parseDay(dto.startDate, 'startDate');
    const vis = applyVisibility(
      { visibility: itinerary.visibility, publishedAt: itinerary.publishedAt },
      dto.visibility,
      new Date(),
    );
    itinerary.visibility = vis.visibility;
    itinerary.publishedAt = vis.publishedAt;

    // a new start date shifts every day's date -> same numbering path as every other change
    await this.store.saveDays(itinerary, this.store.plainDays(itinerary));
    return presentItinerary(itinerary.toObject());
  }

  // ITN-01 delete (its activities/budgets too; other people's clones stay)
  async remove(user: AuthUser, id: string) {
    const itinerary = await this.store.loadOwned(id, user);
    return this.store.deleteWithChildren(itinerary._id);
  }
}