import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ min: 0, default: 1 })
  carryOnBags: number;

  @Prop({ min: 0, default: 1 })
  checkedBags: number;

  @Prop({ min: 0, default: 23 })
  checkedBagWeightKg: number;

  @Prop({ min: 0 })
  carryOnWeightKg?: number;
}

export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

@Schema({ _id: false })
export class CancellationPolicy {
  @Prop({ default: false })
  refundable: boolean;

  @Prop({ min: 0, default: 0 })
  cancellationFee: number;

  @Prop({ min: 0, default: 24 })
  cancellationDeadlineHours: number;

  @Prop({ min: 0, max: 100, default: 0 })
  refundPercentage: number;
}

export const CancellationPolicySchema =
  SchemaFactory.createForClass(CancellationPolicy);

export type AirlineDocument = HydratedDocument<Airline>;

@Schema({ timestamps: true })
export class Airline {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop()
  description: string;

  @Prop()
  logo: string;

  @Prop()
  country: string;

  @Prop({ type: BaggagePolicySchema, default: () => ({}) })
  baggagePolicy: BaggagePolicy;

  @Prop({ type: CancellationPolicySchema, default: () => ({}) })
  cancellationPolicy: CancellationPolicy;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const AirlineSchema = SchemaFactory.createForClass(Airline);
