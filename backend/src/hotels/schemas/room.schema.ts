import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Hotel } from './hotel.schema.js';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: true })
export class Room {
  @Prop({ type: Types.ObjectId, ref: Hotel.name, required: true })
  hotelId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 1 })
  maxAdults: number;

  @Prop({ default: 0, min: 0 })
  maxChildren: number;

  @Prop({ required: true, min: 0 })
  pricePerNight: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// list a hotel's active rooms
RoomSchema.index({ hotelId: 1, isActive: 1 });
// no duplicate names among a hotel's active rooms (soft-deleted names can be reused)
RoomSchema.index(
  { hotelId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
