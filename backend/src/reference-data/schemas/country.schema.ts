import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CountryDocument = HydratedDocument<Country>;

/** GEN-12: one row of Countries.csv. `currency` is a supported platform currency. */
@Schema({ collection: 'countries' })
export class Country {
  /** ISO 3166-1 alpha-2 code from the dataset, for example "EG". */
  @Prop({ type: String, required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** Currency code from the dataset, for example "EGP". */
  @Prop({ type: String, required: true, uppercase: true, trim: true, index: true })
  currency: string;
}

export const CountrySchema = SchemaFactory.createForClass(Country);
