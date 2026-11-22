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
import { RoomsService } from './rooms/rooms.service.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { AvailabilityService } from './availability/availability.service.js';
import { AvailabilityController } from './availability/availability.controller.js';


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
  providers: [HotelsService, RoomsService, AvailabilityService],
  controllers: [HotelsController, RoomsController, AvailabilityController],
})
export class HotelsModule {}
