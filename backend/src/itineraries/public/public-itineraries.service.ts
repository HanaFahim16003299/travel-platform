import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthUser } from '../../auth/decorators.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ITINERARY_SORT_FIELDS } from '../itinerary.constants.js';
import { CloneItineraryDto } from '../dto/itinerary.dto.js';
import { SearchPublicItinerariesDto } from '../dto/itinerary-query.dto.js';
import { buildClone } from '../domain/clone.js';
import {
  buildPublicSearchFilter,
  buildSort,
  keywordRegex,
  validateDayRange,
  validateSort,
} from '../domain/search.js';
import { authorName, presentItinerary } from '../domain/presenter.js';
import { ItineraryStore } from '../shared/itinerary-store.service.js';
import { assertObjectId, parseDay, rejectIf } from '../shared/http-guards.js';

/** ITN-20 / ITN-21 / BLG-12: everything other people can see, plus cloning. */
@Injectable()
export class PublicItinerariesService {
  constructor(private readonly store: ItineraryStore) {}

  // ITN-21 search: keyword in title / country name / city name; filters country, city, min/max days
  async search(query: SearchPublicItinerariesDto) {
    rejectIf(validateDayRange(query.minDays, query.maxDays));
    rejectIf(validateSort(query.sort, ITINERARY_SORT_FIELDS));

    let keyword;
    if (query.q) {
      const regex = keywordRegex(query.q);
      keyword = {
        regex,
        countryIds: await this.store.idsByName('Country', regex),
        cityIds: await this.store.idsByName('City', regex),
      };
    }
    const filter = buildPublicSearchFilter({
      visibleFilter: await this.store.visibleFilter(),
      countryId: query.countryId,
      cityId: query.cityId,
      minDays: query.minDays,
      maxDays: query.maxDays,
      keyword,
    });
    const sort = buildSort(query.sort, query.order, { publishedAt: -1 });
    return this.store.page(filter, sort, query.page, query.limit, true);
  }

  // ITN-21 read-only view: author, days, activities and budget
  async view(id: string) {
    const itinerary = await this.store.loadPublic(id);
    return presentItinerary(itinerary, await this.store.loadChildren(itinerary._id));
  }

  // ITN-21 clone: an independent PRIVATE copy that credits the original author
  async clone(user: AuthUser, id: string, dto: CloneItineraryDto) {
    const source = await this.store.loadCloneable(id, user);
    const { data, days, dayIdMap } = buildClone(
      {
        _id: source._id,
        ownerId: source.ownerId?._id ?? source.ownerId, // populated user -> just its id
        title: source.title,
        description: source.description,
        countryIds: source.countryIds,
        startDate: source.startDate,
        days: source.days,
      },
      {
        newOwnerId: new Types.ObjectId(user.id),
        sourceOwnerName: authorName(source.ownerId),
        title: dto.title,
        startDate: dto.startDate ? parseDay(dto.startDate, 'startDate') : undefined,
        now: new Date(),
        newId: () => new Types.ObjectId(),
      },
    );
    const copy = await this.store.create(data, days);
    await this.store.copyChildren(source._id, copy._id, dayIdMap);
    return presentItinerary(copy.toObject());
  }

  // BLG-12 author page: an author's public itineraries (used by Mohamed Elhamy's AuthorsController)
  async listByAuthor(authorId: string, query: PaginationQueryDto) {
    assertObjectId(authorId, 'author id');
    const filter = { $and: [await this.store.visibleFilter(), { ownerId: new Types.ObjectId(authorId) }] };
    return this.store.page(filter, buildSort(undefined, undefined, { updatedAt: -1 }), query.page, query.limit);
  }
}