import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Connection } from 'mongoose'; // type-only: mongoose doesn't expose Connection to ESM at runtime
import type { AuthUser } from '../../auth/decorators.js';
import { assertOwner } from '../../common/ownership.js';
import { AccountStatus } from '../../common/enums/index.js';
import { buildMeta } from '../../common/utils/pagination.js';
import { ITINERARY_CHILD_KEYS, ITINERARY_CHILD_MODELS, ItineraryVisibility } from '../itinerary.constants.js';
import { Itinerary, type ItineraryDocument } from '../schemas/itinerary.schema.js';
import { copyChildForClone } from '../domain/clone.js';
import { type DayInput, renumberDays } from '../domain/days.js';
import { presentItinerary } from '../domain/presenter.js';
import { skipFor } from '../domain/search.js';
import { assertObjectId } from './http-guards.js';

type Plain = Record<string, any>;

/**
 * THE ONLY CLASS THAT TALKS TO MONGODB for itineraries.
 * Services never write queries themselves: they call the store, then pure functions.
 * Teammates (Hana Fahim, Mohamed Elhamy) use it too, e.g. store.loadOwned() for ownership.
 */
@Injectable()
export class ItineraryStore {
  constructor(
    @InjectModel(Itinerary.name) readonly model: Model<ItineraryDocument>,
    // reach teammates' models by name *if* they are registered yet (nothing crashes if not)
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ---------------------------------------------------------------- read

  /** Owner only. 400 bad id, 404 missing, 403 not yours (team helper assertOwner). */
  async loadOwned(id: string, user: AuthUser): Promise<ItineraryDocument> {
    assertObjectId(id);
    const itinerary = await this.model.findById(id);
    if (!itinerary) throw new NotFoundException('Itinerary not found');
    assertOwner(itinerary.ownerId, user);
    return itinerary;
  }

  /** A publicly visible itinerary, or 404 (never 403: don't reveal that a private id exists). */
  async loadPublic(id: string): Promise<Plain> {
    return this.findOneWithAuthor(id, await this.visibleFilter());
  }

  /** Something a user may clone: publicly visible, or their own. */
  async loadCloneable(id: string, user: AuthUser): Promise<Plain> {
    return this.findOneWithAuthor(id, {
      $or: [await this.visibleFilter(), { ownerId: new Types.ObjectId(user.id) }],
    });
  }

  /** The days as plain objects, ready to hand to pure functions. */
  plainDays(itinerary: ItineraryDocument): DayInput[] {
    return itinerary.toObject().days as DayInput[];
  }

  /** Page of itineraries, each shaped by the pure presenter. Returns the team's { data, meta } format. */
  async page(filter: Plain, sort: Record<string, 1 | -1>, page: number, limit: number, withOwner = false) {
    let query = this.model.find(filter).sort(sort).skip(skipFor(page, limit)).limit(limit);
    if (withOwner) query = query.populate('ownerId', 'firstName lastName');
    const [items, total] = await Promise.all([query.lean(), this.model.countDocuments(filter)]);
    return { data: items.map((i) => presentItinerary(i)), meta: buildMeta(total, page, limit) };
  }

  /**
   * What "visible to the public" means, in ONE place:
   * ITN-20 public + GEN-10 not hidden by an admin + ACC-12 author not deactivated.
   */
  async visibleFilter(): Promise<Plain> {
    const filter: Plain = { visibility: ItineraryVisibility.Public, hidden: { $ne: true } };
    const User = this.optionalModel('User');
    if (User) {
      const deactivated = await User.distinct('_id', { status: AccountStatus.Deactivated });
      if (deactivated.length) filter.ownerId = { $nin: deactivated };
    }
    return filter;
  }

  // ---------------------------------------------------------------- write

  /** New itinerary. Days are numbered here, through the same path as every later change. */
  create(data: Plain, days: DayInput[] = []): Promise<ItineraryDocument> {
    return this.saveDays(new this.model(data), days);
  }

  /**
   * THE one place days are written: renumber (pure) + keep dayCount in sync + save.
   * Used by create, edit (new start date), add/edit/delete/reorder day and clone.
   */
  saveDays(itinerary: ItineraryDocument, days: DayInput[]): Promise<ItineraryDocument> {
    const numbered = renumberDays(days, itinerary.startDate);
    itinerary.set('days', numbered);
    itinerary.dayCount = numbered.length;
    return this.save(itinerary);
  }

  /** Save; a concurrent edit (optimisticConcurrency) becomes a clear 409 instead of a 500. */
   /** Save; a concurrent edit (optimisticConcurrency) becomes a clear 409 instead of a 500. */
  async save(itinerary: ItineraryDocument): Promise<ItineraryDocument> {
    try {
      return await itinerary.save();
    } catch (err) {
      // Mongoose throws an error named 'VersionError' when the document changed since we loaded it
      if ((err as { name?: string })?.name === 'VersionError')
        throw new ConflictException('This itinerary was changed by another request. Reload and try again.');
      throw err;
    }
  }
  

  /** Delete an itinerary and everything hanging off it. Clones made by others are separate documents, untouched. */
  async deleteWithChildren(itineraryId: Types.ObjectId) {
    await this.model.deleteOne({ _id: itineraryId });
    await this.deleteChildren({ itineraryId });
    return { deleted: true, id: String(itineraryId) };
  }

  // ---------------------------------------------------------------- reference data (Hana Fahim)

  /** 400 if any country/city id doesn't exist. Skipped while reference data isn't merged. */
  async assertReferencesExist(modelName: 'Country' | 'City', ids: unknown[]) {
    const model = this.optionalModel(modelName);
    const unique = [...new Set(ids.map(String))];
    if (!model || unique.length === 0) return;
    const found = await model.countDocuments({ _id: { $in: unique } });
    if (found !== unique.length) throw new BadRequestException(`Unknown ${modelName.toLowerCase()} id`);
  }

  /** Ids of countries/cities whose name matches (field "name" assumed). Empty if not merged. */
  async idsByName(modelName: 'Country' | 'City', regex: RegExp): Promise<unknown[]> {
    const model = this.optionalModel(modelName);
    return model ? model.distinct('_id', { name: regex }) : [];
  }

  /** null = no Airport model yet (reference data not merged). */
  async airportsInCity(cityId: string): Promise<Plain[] | null> {
    const Airport = this.optionalModel('Airport');
    return Airport ? Airport.find({ cityId: new Types.ObjectId(cityId) }).lean<Plain[]>() : null;
  }

  /** undefined = no Airport model yet; null = model exists but no such airport. */
  async airportById(id: string): Promise<Plain | null | undefined> {
    const Airport = this.optionalModel('Airport');
    return Airport ? Airport.findById(id).lean<Plain>() : undefined;
  }

  // ---------------------------------------------------------------- children (Hana Fahim's activities/budgets)

  async loadChildren(itineraryId: unknown): Promise<Record<string, unknown[]>> {
    const result: Record<string, unknown[]> = {};
    for (const [name, model] of this.childModels()) {
      result[ITINERARY_CHILD_KEYS[name]] = await model.find({ itineraryId }).lean();
    }
    return result;
  }

  async deleteChildren(filter: { itineraryId?: unknown; dayId?: unknown }) {
    for (const [, model] of this.childModels()) await model.deleteMany(filter);
  }

  async copyChildren(fromId: unknown, toId: Types.ObjectId, dayIdMap: Map<string, Types.ObjectId>) {
    for (const [, model] of this.childModels()) {
      const docs = await model.find({ itineraryId: fromId }).lean<Plain[]>();
      if (docs.length) await model.insertMany(docs.map((d) => copyChildForClone(d, toId, dayIdMap)));
    }
  }

  // ---------------------------------------------------------------- private helpers

  /** A teammate's model if it is registered, otherwise undefined (so nothing crashes before it is merged). */
  private optionalModel(name: string): Model<any> | undefined {
    return this.connection.models[name];
  }

  /** Activity / BudgetEntry / TransportCost models that exist right now, with their names. */
  private childModels() {
    return ITINERARY_CHILD_MODELS.flatMap((name) => {
      const model = this.optionalModel(name);
      return model ? [[name, model] as const] : [];
    });
  }

  /** One itinerary matching `filter` + id, with its author's name; 404 otherwise. */
  private async findOneWithAuthor(id: string, filter: Plain): Promise<Plain> {
    assertObjectId(id);
    const found = await this.model
      .findOne({ $and: [filter, { _id: id }] })
      .populate('ownerId', 'firstName lastName')
      .lean();
    if (!found) throw new NotFoundException('Itinerary not found');
    return found;
  }
}
//Think of the store as the librarian: nobody else touches the shelves (the database). Your services ask the librarian, then use your pure rules.