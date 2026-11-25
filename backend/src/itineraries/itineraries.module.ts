import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema.js';
import { ItineraryStore } from './shared/itinerary-store.service.js';
import { ItinerariesService } from './core/itineraries.service.js';
import { ItinerariesController } from './core/itineraries.controller.js';
import { ItineraryDaysService } from './days/itinerary-days.service.js';
import { ItineraryDaysController } from './days/itinerary-days.controller.js';
import { PublicItinerariesService } from './public/public-itineraries.service.js';
import { PublicItinerariesController } from './public/public-itineraries.controller.js';

/**
 * Itineraries core (Hana Tarek). Built package by package:
 *   Package A: core/ = my itineraries CRUD + visibility + ownership
 *   Package B: days/ = add / edit / delete / reorder days
 *   Package C (now): public/ = public search, public view, clone with attribution
 *   Package D: travel/   + moderation/
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Itinerary.name, schema: ItinerarySchema }])],
  // Public FIRST: its fixed paths ("public/search", "public/:id") are registered before any ":id" path.
  controllers: [PublicItinerariesController, ItineraryDaysController, ItinerariesController],
  providers: [ItineraryStore, ItinerariesService, ItineraryDaysService, PublicItinerariesService],
  exports: [MongooseModule, ItineraryStore, PublicItinerariesService],
})
export class ItinerariesModule {}