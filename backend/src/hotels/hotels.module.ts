import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hotel, HotelSchema } from './schemas/hotel.schema.js';
import { Room, RoomSchema } from './schemas/room.schema.js';
import {
  RoomAvailability,
  RoomAvailabilitySchema,
} from './schemas/room-availability.schema.js';
import { HotelsService } from './hotels.service.js';
import { HotelsController } from './hotels.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomAvailability.name, schema: RoomAvailabilitySchema },
    ]),
  ],
  // lets other modules (admin, hotel-bookings) inject the Hotel/Room models
  exports: [MongooseModule],
  providers: [HotelsService],
  controllers: [HotelsController],
})
export class HotelsModule {}