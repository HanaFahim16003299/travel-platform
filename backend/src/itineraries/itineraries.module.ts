import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema.js';
import { ItineraryStore } from './shared/itinerary-store.service.js';
import { ItinerariesService } from './core/itineraries.service.js';
import { ItinerariesController } from './core/itineraries.controller.js';
import { ItineraryDaysService } from './days/itinerary-days.service.js';
import { ItineraryDaysController } from './days/itinerary-days.controller.js';

/**
 * Itineraries core (Hana Tarek). Built package by package:
 *   Package A: core/ = my itineraries CRUD + visibility + ownership
 *   Package B (now): days/ = add / edit / delete / reorder days
 *   Package C: public/   Package D: travel/   + moderation/
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Itinerary.name, schema: ItinerarySchema }])],
  controllers: [ItineraryDaysController, ItinerariesController],
  providers: [ItineraryStore, ItinerariesService, ItineraryDaysService],
  exports: [MongooseModule, ItineraryStore],
})
export class ItinerariesModule {}