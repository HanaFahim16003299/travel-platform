import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  City,
  type CityDocument,
} from '../../reference-data/schemas/city.schema.js';
import {
  Country,
  type CountryDocument,
} from '../../reference-data/schemas/country.schema.js';

// Added by Mohamed Hesham: HTL-11 and HTL-01. The only place the hotels module
// reads the seeded cities and countries (reference data, read only).
@Injectable()
export class DestinationsService {
  constructor(
    @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
    @InjectModel(Country.name)
    private readonly countryModel: Model<CountryDocument>,
  ) {}

  // HTL-11: ids of the cities whose name matches the text, or that belong to a
  // country whose name matches it (or whose code is exactly the text, like "EG")
  async findCityIds(text: string): Promise<Types.ObjectId[]> {
    const search = text.trim();
    const matcher = new RegExp(escapeRegex(search), 'i');

    const countries = await this.countryModel
      .find({ $or: [{ name: matcher }, { code: search.toUpperCase() }] })
      .select('code')
      .lean();
    const cities = await this.cityModel
      .find({
        $or: [
          { name: matcher },
          { countryCode: { $in: countries.map((country) => country.code) } },
        ],
      })
      .select('_id')
      .lean();

    return cities.map((city) => city._id);
  }

  // HTL-01: a hotel can only be placed in one of the seeded cities
  async assertCityExists(cityId: string): Promise<void> {
    if (!(await this.cityModel.exists({ _id: cityId }))) {
      throw new BadRequestException('Unknown city');
    }
  }
}

// makes the user's text literal inside a regular expression
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
