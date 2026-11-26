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

  // FLT-08: price of one extra checked bag (must be positive when set). Added by Joumana Hozayen.
  @Prop({ min: 0 })
  extraBagPrice?: number;

  // FLT-08: how many extra bags one passenger may add (0 = none). Added by Joumana Hozayen.
  @Prop({ min: 0, default: 0 })
  maxExtraBags: number;
}

export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

// FLT-09: one cancellation tier: cancelling at least `daysBefore` days before departure
// refunds `refundPercent`. Added by Joumana Hozayen.
@Schema({ _id: false })
export class AirlineCancellationTier {
  @Prop({ required: true, min: 0 })
  daysBefore: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercent: number;
}

export const AirlineCancellationTierSchema = SchemaFactory.createForClass(
  AirlineCancellationTier,
);

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

  // FLT-09: tiered refunds; when present they replace the single-rule fields above.
  // Added by Joumana Hozayen.
  @Prop({ type: [AirlineCancellationTierSchema], default: [] })
  tiers: AirlineCancellationTier[];
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
