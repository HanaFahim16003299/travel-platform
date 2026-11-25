import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AirportDocument = HydratedDocument<Airport>;

/**
 * FLT-02: one row of Airports.csv. Read-only after seeding.
 * Flights reference an airport by this document's _id.
 * `timeZone` is the airport's IANA time zone (GEN-06, FLT-03).
 */
@Schema({ collection: 'airports' })
export class Airport {
  declare _id: Types.ObjectId;

  /** IATA code from the dataset, for example "CAI". */
  @Prop({ type: String, required: true, unique: true, uppercase: true, trim: true })
  iataCode: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** The City document's _id. */
  @Prop({ type: Types.ObjectId, ref: 'City', required: true, index: true })
  cityId: Types.ObjectId;

  /** The dataset's city_id slug, for example "cairo". */
  @Prop({ type: String, required: true, trim: true })
  cityKey: string;

  @Prop({ type: String, required: true, trim: true })
  cityName: string;

  @Prop({ type: String, required: true, uppercase: true, trim: true, index: true })
  countryCode: string;

  @Prop({ type: String, required: true, trim: true })
  countryName: string;

  /** IANA time zone, for example "Africa/Cairo". */
  @Prop({ type: String, required: true, trim: true })
  timeZone: string;
}

export const AirportSchema = SchemaFactory.createForClass(Airport);
