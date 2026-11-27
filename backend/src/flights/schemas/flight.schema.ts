import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum FlightStatus {
  Scheduled = 'scheduled',
  Cancelled = 'cancelled',
  // FLT-30: set by FlightsScheduler once the departure time has passed (was the unused
  // Completed; renamed by Joumana Hozayen, review C7).
  Departed = 'departed',
}

export enum CabinClass {
  Economy = 'economy',
  PremiumEconomy = 'premium_economy',
  Business = 'business',
  First = 'first',
}

@Schema({ timestamps: true })
export class FlightCabin {
  declare _id: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Object.values(CabinClass) })
  cabinClass: CabinClass;

  @Prop({ required: true, min: 0 })
  capacity: number;

  @Prop({ required: true, min: 0 })
  availableSeats: number;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, default: 'USD', uppercase: true })
  currency: string;
}

export const FlightCabinSchema = SchemaFactory.createForClass(FlightCabin);
export type FlightDocument = HydratedDocument<Flight>;

@Schema({ timestamps: true })
export class Flight {
  declare _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Airline', required: true, index: true })
  airlineId: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  flightNumber: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  departureAirportId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  arrivalAirportId: Types.ObjectId;

  @Prop({ required: true, type: Date, index: true })
  departureTime: Date;

  @Prop({ required: true, type: Date })
  arrivalTime: Date;

  @Prop({
    type: String,
    enum: Object.values(FlightStatus),
    default: FlightStatus.Scheduled,
    index: true,
  })
  status: FlightStatus;

  @Prop({ type: [FlightCabinSchema], default: [] })
  cabins: FlightCabin[];
}

export const FlightSchema = SchemaFactory.createForClass(Flight);
FlightSchema.index({
  departureAirportId: 1,
  arrivalAirportId: 1,
  departureTime: 1,
});
FlightSchema.index({ airlineId: 1, flightNumber: 1 }, { unique: true });
