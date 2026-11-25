import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema.js';
import { ItineraryStore } from './shared/itinerary-store.service.js';
import { ItinerariesService } from './core/itineraries.service.js';
import { ItinerariesController } from './core/itineraries.controller.js';

/**
 * Itineraries core (Hana Tarek). Built package by package:
 *   Package A (now): core/ = my itineraries CRUD + visibility + ownership
 *   Package B: days/   Package C: public/   Package D: travel/   + moderation/
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Itinerary.name, schema: ItinerarySchema }])],
  controllers: [ItinerariesController],
  providers: [ItineraryStore, ItinerariesService],
  exports: [MongooseModule, ItineraryStore],
})
export class ItinerariesModule {}