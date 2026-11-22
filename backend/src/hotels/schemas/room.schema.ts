import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Hotel } from './hotel.schema.js';
import { RoomType } from '../constants/room-type.js';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: true })
export class Room {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Hotel.name,
    required: true,
  })
  hotelId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, type: String, enum: Object.values(RoomType) })
  type: RoomType;

  @Prop({ required: true, min: 1 })
  beds: number;

  @Prop({ required: true, min: 1 })
  maxAdults: number;

  @Prop({ default: 0, min: 0 })
  maxChildren: number;

  @Prop({ required: true, min: 0.01 })
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
// no duplicate room names within a hotel
RoomSchema.index({ hotelId: 1, name: 1 }, { unique: true });
