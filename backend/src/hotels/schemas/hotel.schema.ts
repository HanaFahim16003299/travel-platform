import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { TIME_REGEX } from '../constants/time-regex.js';

export type HotelDocument = HydratedDocument<Hotel>;

@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0 })
  daysBeforeCheckIn: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercent: number;
}
export const CancellationTierSchema =
  SchemaFactory.createForClass(CancellationTier);

@Schema({ _id: false })
export class HotelPolicies {
  @Prop({ type: [CancellationTierSchema], default: [] })
  cancellationTiers: CancellationTier[];

  @Prop({ type: [String], default: [] })
  houseRules: string[];
}
export const HotelPoliciesSchema = SchemaFactory.createForClass(HotelPolicies);

@Schema({ timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
  cityId: Types.ObjectId;

  @Prop({ required: true })
  address: string;

  @Prop({ min: 1, max: 5 })
  starRating?: number;

  @Prop({ default: 0, min: 0, max: 5 })
  averageRating: number;

  @Prop({ default: 0, min: 0 })
  reviewCount: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true, match: TIME_REGEX })
  checkInTime: string; // "14:00"

  @Prop({ required: true, match: TIME_REGEX })
  checkOutTime: string;

  @Prop({ type: HotelPoliciesSchema, default: () => ({}) })
  policies: HotelPolicies;

  @Prop({ default: true })
  isActive: boolean;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);

HotelSchema.index({ cityId: 1, isActive: 1, starRating: -1 });
HotelSchema.index({ name: 'text' });
