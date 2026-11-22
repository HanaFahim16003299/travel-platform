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
import { HotelSearchService } from './search/hotel-search.service.js';
import { HotelSearchController } from './search/hotel-search.controller.js';

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
  providers: [
    HotelsService,
    RoomsService,
    AvailabilityService,
    HotelSearchService,
  ],
  // HotelSearchController (GET /hotels/search) must be registered before
  // HotelsController so 'search' is never captured by HotelsController's :id
  controllers: [
    HotelSearchController,
    HotelsController,
    RoomsController,
    AvailabilityController,
  ],
})
export class HotelsModule {}
