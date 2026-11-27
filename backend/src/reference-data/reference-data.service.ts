import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { buildMeta } from '../common/utils/pagination.js';
import type {
  AirportsQueryDto,
  AttractionsQueryDto,
  CitiesQueryDto,
} from './dto/reference-queries.dto.js';
import { Airport } from './schemas/airport.schema.js';
import type { AirportDocument } from './schemas/airport.schema.js';
import { Attraction } from './schemas/attraction.schema.js';
import type { AttractionDocument } from './schemas/attraction.schema.js';
import { City } from './schemas/city.schema.js';
import type { CityDocument } from './schemas/city.schema.js';
import { Country } from './schemas/country.schema.js';
import type { CountryDocument } from './schemas/country.schema.js';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortSpec(
  query: PaginationQueryDto,
  allowed: string[],
  fallback: string,
): Record<string, 1 | -1> {
  const field = query.sort && allowed.includes(query.sort) ? query.sort : fallback;
  return { [field]: query.order === 'desc' ? -1 : 1 };
}

/**
 * Read access to the reference datasets (GEN-12): countries, cities, airports,
 * attractions and the supported currencies. The module is @Global, so other
 * modules can inject this service without importing anything, for example:
 *   await this.reference.airportsExist([dto.originAirportId, dto.destinationAirportId])
 */
@Injectable()
export class ReferenceDataService {
  constructor(
    @InjectModel(Country.name) private readonly countries: Model<CountryDocument>,
    @InjectModel(City.name) private readonly cities: Model<CityDocument>,
    @InjectModel(Airport.name) private readonly airports: Model<AirportDocument>,
    @InjectModel(Attraction.name) private readonly attractions: Model<AttractionDocument>,
  ) {}

  private async paginate(
    query: PaginationQueryDto,
    find: (skip: number, limit: number) => PromiseLike<unknown[]>,
    count: () => PromiseLike<number>,
  ) {
    const [data, total] = await Promise.all([find((query.page - 1) * query.limit, query.limit), count()]);
    return { data, meta: buildMeta(total, query.page, query.limit) };
  }

  listCountries(query: PaginationQueryDto) {
    const sort = sortSpec(query, ['name', 'code', 'currency'], 'name');
    return this.paginate(
      query,
      (skip, limit) => this.countries.find().sort(sort).skip(skip).limit(limit).lean(),
      () => this.countries.countDocuments(),
    );
  }

  listCities(query: CitiesQueryDto) {
    const filter: QueryFilter<CityDocument> = {};
    if (query.countryCode) filter.countryCode = query.countryCode;
    if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
    const sort = sortSpec(query, ['name', 'countryCode'], 'name');
    return this.paginate(
      query,
      (skip, limit) => this.cities.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      () => this.cities.countDocuments(filter),
    );
  }

  listAirports(query: AirportsQueryDto) {
    const filter: QueryFilter<AirportDocument> = {};
    if (query.countryCode) filter.countryCode = query.countryCode;
    if (query.cityId) filter.cityId = new Types.ObjectId(query.cityId);
    if (query.q) {
      const rx = { $regex: escapeRegex(query.q), $options: 'i' };
      filter.$or = [{ iataCode: rx }, { name: rx }, { cityName: rx }];
    }
    const sort = sortSpec(query, ['iataCode', 'name', 'cityName', 'countryCode'], 'iataCode');
    return this.paginate(
      query,
      (skip, limit) => this.airports.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      () => this.airports.countDocuments(filter),
    );
  }

  listAttractions(query: AttractionsQueryDto) {
    const filter: QueryFilter<AttractionDocument> = {};
    if (query.cityId) filter.cityId = new Types.ObjectId(query.cityId);
    if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
    const sort = sortSpec(query, ['name'], 'name');
    return this.paginate(
      query,
      (skip, limit) => this.attractions.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      () => this.attractions.countDocuments(filter),
    );
  }

  /** Returns the airport, or null when the id is malformed or unknown. */
  getAirport(id: string) {
    if (!isValidObjectId(id)) return null;
    return this.airports.findById(id).lean();
  }

  /** Sorted list of the currency codes of all seeded countries, for example ["AED","EGP",...]. */
  async currencies(): Promise<string[]> {
    const codes = (await this.countries.distinct('currency')) as string[];
    return codes.sort();
  }

  async isSupportedCurrency(code: string): Promise<boolean> {
    if (!code) return false;
    return (await this.countries.exists({ currency: code.toUpperCase() })) !== null;
  }

  /** True only when every id is a valid ObjectId of a seeded airport (FLT-02). */
  async airportsExist(ids: string[]): Promise<boolean> {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || !unique.every((id) => isValidObjectId(id))) return false;
    const count = await this.airports.countDocuments({ _id: { $in: unique } });
    return count === unique.length;
  }

  async cityExists(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    return (await this.cities.exists({ _id: id })) !== null;
  }

  /** True when the two-letter country code is in the dataset, for example "EG". */
  async countryExists(code: string): Promise<boolean> {
    if (!code) return false;
    return (await this.countries.exists({ code: code.toUpperCase() })) !== null;
  }
}
