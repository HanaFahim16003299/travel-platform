import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightsModule } from '../flights/flights.module.js';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema.js';
import { ItineraryStore } from './shared/itinerary-store.service.js';
import { ItinerariesService } from './core/itineraries.service.js';
import { ItinerariesController } from './core/itineraries.controller.js';
import { ItineraryDaysService } from './days/itinerary-days.service.js';
import { ItineraryDaysController } from './days/itinerary-days.controller.js';
import { PublicItinerariesService } from './public/public-itineraries.service.js';
import { PublicItinerariesController } from './public/public-itineraries.controller.js';
import { ItineraryTravelService } from './travel/itinerary-travel.service.js';
import { ItineraryTravelController } from './travel/itinerary-travel.controller.js';
import { ItineraryModerationService } from './moderation/itinerary-moderation.service.js';

/**
 * Itineraries core (Hana Tarek). One folder per sub-feature:
 *   domain/     pure rules (no DB, no Nest)        shared/  the store (only DB access) + HTTP guards
 *   core/       my itineraries CRUD + visibility   days/    add / edit / delete / reorder days
 *   public/     public search, view, clone         travel/  hotel + flight search reuse
 *   moderation/ hide / delete for admins (used by the blog's report review)
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Itinerary.name, schema: ItinerarySchema }]),
    FlightsModule, // ITN-26 reuses FlightsService.search (exported by Mahmoud)
  ],
  // Public first: its fixed paths ("public/search") are registered before any ":id" path.
  controllers: [PublicItinerariesController, ItineraryTravelController, ItineraryDaysController, ItinerariesController],
  providers: [
    ItineraryStore,
    ItinerariesService,
    ItineraryDaysService,
    PublicItinerariesService,
    ItineraryTravelService,
    ItineraryModerationService,
  ],
  // For teammates: Hana Fahim (store.loadOwned for activities/budgets),
  // Mohamed Elhamy (moderation for GEN-10, publicItineraries.listByAuthor for BLG-12).
  exports: [MongooseModule, ItineraryStore, PublicItinerariesService, ItineraryModerationService],
})
export class ItinerariesModule {}