import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttractionDocument = HydratedDocument<Attraction>;

/** GEN-12: one row of Attractions.csv. */
@Schema({ collection: 'attractions' })
export class Attraction {
  declare _id: Types.ObjectId;

  /** The dataset's attraction_id, for example "att-1". */
  @Prop({ type: String, required: true, unique: true, trim: true })
  key: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** The City document's _id. */
  @Prop({ type: Types.ObjectId, ref: 'City', required: true, index: true })
  cityId: Types.ObjectId;

  /** The dataset's city_id slug, for example "cairo". */
  @Prop({ type: String, required: true, trim: true })
  cityKey: string;
}

export const AttractionSchema = SchemaFactory.createForClass(Attraction);
