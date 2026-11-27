import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hotel, HotelSchema } from './schemas/hotel.schema.js';
import { Room, RoomSchema } from './schemas/room.schema.js';
import {
  RoomAvailability,
  RoomAvailabilitySchema,
} from './schemas/room-availability.schema.js';
// Added by Mohamed Hesham: HTL-08, lets the availability view read the booking reference.
import {
  HotelBooking,
  HotelBookingSchema,
} from '../hotel-bookings/schemas/hotel-booking.schema.js';
// Added by Mohamed Hesham: HTL-11 and HTL-01, read the seeded cities and countries.
import { City, CitySchema } from '../reference-data/schemas/city.schema.js';
import {
  Country,
  CountrySchema,
} from '../reference-data/schemas/country.schema.js';
import { DestinationsService } from './destinations/destinations.service.js';
import { HotelsService } from './hotels.service.js';
import { HotelsController } from './hotels.controller.js';
import { RoomsService } from './rooms/rooms.service.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { AvailabilityService } from './availability/availability.service.js';
import { AvailabilityController } from './availability/availability.controller.js';
import { HotelSearchService } from './search/hotel-search.service.js';
import { HotelSearchController } from './search/hotel-search.controller.js';
// Added by Mohamed Hesham: GEN-08, hotel photos.
import { HotelImagesService } from './images/hotel-images.service.js';
import { HotelImagesController } from './images/hotel-images.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomAvailability.name, schema: RoomAvailabilitySchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: City.name, schema: CitySchema },
      { name: Country.name, schema: CountrySchema },
    ]),
  ],
  // lets other modules (admin, hotel-bookings) inject the Hotel/Room models
  exports: [MongooseModule],
  providers: [
    HotelsService,
    RoomsService,
    AvailabilityService,
    HotelSearchService,
    DestinationsService,
    HotelImagesService,
  ],
  // HotelSearchController (GET /hotels/search) must be registered before
  // HotelsController so 'search' is never captured by HotelsController's :id
  controllers: [
    HotelSearchController,
    HotelsController,
    RoomsController,
    AvailabilityController,
    HotelImagesController,
  ],
})
export class HotelsModule {}
