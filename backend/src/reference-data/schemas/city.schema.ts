import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CityDocument = HydratedDocument<City>;

/** GEN-12: one row of Cities.csv. */
@Schema({ collection: 'cities' })
export class City {
  declare _id: Types.ObjectId;

  /** The dataset's city_id, for example "new_york". */
  @Prop({ type: String, required: true, unique: true, trim: true })
  key: string;

  @Prop({ type: String, required: true, trim: true, index: true })
  name: string;

  @Prop({ type: String, required: true, uppercase: true, trim: true, index: true })
  countryCode: string;
}

export const CitySchema = SchemaFactory.createForClass(City);
