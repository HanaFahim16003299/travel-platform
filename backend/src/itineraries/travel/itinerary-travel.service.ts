import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { AuthUser } from '../../auth/decorators.js';
import { FlightsService } from '../../flights/flights.service.js';
import { SearchFlightsDto } from '../../flights/dto/search-flights.dto.js';
import { HotelSearchService } from '../../hotels/search/hotel-search.service.js';
import { QuerySearchHotelsDto } from '../../hotels/dto/search-hotels.dto.js';
import { ItineraryFlightSearchDto, ItineraryHotelSearchDto } from '../dto/itinerary-query.dto.js';
import { groupDaysByCity } from '../domain/city-groups.js';
import { toYmd } from '../domain/dates.js';
import {
  firstDayCity,
  hotelStayFor,
  resolveFlightDates,
  timeZoneOf,
  validateFlightDates,
  validateGroupChoice,
} from '../domain/travel.js';
import { ItineraryStore } from '../shared/itinerary-store.service.js';
import { parseDay, rejectIf } from '../shared/http-guards.js';

/**
 * ITN-25 / ITN-26: reuse hotel search and flight search from the itinerary.
 * Pure functions (domain/travel.ts) build the QUESTION; teammates' services ANSWER it.
 */
@Injectable()
export class ItineraryTravelService implements OnModuleInit {
  private hotelSearch?: HotelSearchService;

  constructor(
    private readonly store: ItineraryStore,
    private readonly flightsService: FlightsService, // exported by FlightsModule (Mahmoud) // exported by FlightsModule (Mahmoud)
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * HotelsModule (Mohamed Hesham) doesn't export HotelSearchService yet, so normal injection would
   * crash at startup. ModuleRef with strict:false finds it anywhere in the app without editing his
   * module. Once he exports it, switch to a normal constructor parameter + imports: [HotelsModule].
   */
  onModuleInit() {
    try {
      this.hotelSearch = this.moduleRef.get(HotelSearchService, { strict: false });
    } catch {
      this.hotelSearch = undefined;
    }
  }

  // ITN-25: user picks ONE city group + guests + rooms
  async hotels(user: AuthUser, id: string, q: ItineraryHotelSearchDto) {
    const itinerary = await this.store.loadOwned(id, user);
    const groups = groupDaysByCity(itinerary.toObject().days);
    rejectIf(validateGroupChoice(groups.length, q.group));
    if (!this.hotelSearch) throw new BadRequestException('Hotel search is not available');

    const group = groups[q.group - 1];
    const stay = hotelStayFor(group);
    const search = Object.assign(new QuerySearchHotelsDto(), {
      cityId: stay.cityId,
      startDate: stay.checkIn,
      endDate: stay.checkOut, // hotel search treats endDate as the check-out day (exclusive)
      guests: q.guests,
      rooms: q.rooms,
      sort: q.sort,
      order: q.order,
      page: q.page,
      limit: q.limit,
    });
    const results = await this.hotelSearch.search(search); // rejects past check-in dates itself

    return {
      itineraryId: String(itinerary._id),
      group: { number: q.group, ...group, checkIn: toYmd(stay.checkIn), checkOut: toYmd(stay.checkOut) },
      ...results, // { data, meta } exactly as HTL-11 returns them
    };
  }

  // ITN-26: from the chosen origin airport to ANY airport in the city of day 1
  async flights(user: AuthUser, id: string, q: ItineraryFlightSearchDto) {
    const itinerary = await this.store.loadOwned(id, user);
    const days = itinerary.toObject().days;
    const cityId = firstDayCity(days);
    if (!cityId) throw new BadRequestException('Add at least one day first');

    const dates = resolveFlightDates(days, q.tripType, {
      departureDate: q.departureDate ? parseDay(q.departureDate, 'departureDate') : undefined,
      returnDate: q.returnDate ? parseDay(q.returnDate, 'returnDate') : undefined,
    });
    rejectIf(validateFlightDates(dates));
    const departureDate = toYmd(dates.departureDate);
    const returnDate = dates.returnDate ? toYmd(dates.returnDate) : undefined;

    const originTimeZone = await this.originTimeZone(q);
    const destinations = await this.destinations(cityId, q);

    const airports = await Promise.all(
      destinations.map(async (dest) => {
        const search = Object.assign(new SearchFlightsDto(), {
          departureAirportId: q.originAirportId,
          arrivalAirportId: dest.id,
          departureDate,
          departureTimeZone: originTimeZone,
          returnDate,
          returnTimeZone: returnDate ? dest.timeZone : undefined,
          adultCount: q.adults,
          childCount: q.children,
          infantCount: q.infants,
          cabinClass: q.cabinClass,
        });
        return { destinationAirportId: dest.id, ...(await this.flightsService.search(search)) };
      }),
    );

    return {
      itineraryId: String(itinerary._id),
      destinationCityId: cityId,
      tripType: q.tripType,
      departureDate,
      returnDate: returnDate ?? null,
      airports,
    };
  }

  // ------------------------------------------------------------------ airports (reference data)

  private async originTimeZone(q: ItineraryFlightSearchDto): Promise<string> {
    const origin = await this.store.airportById(q.originAirportId);
    if (origin === null) throw new BadRequestException('Unknown origin airport');
    const tz = (origin && timeZoneOf(origin)) ?? q.originTimeZone;
    if (!tz) throw new BadRequestException('originTimeZone is required until airports are seeded');
    return tz;
  }

  /** Airports in the first day's city; until airports are seeded, the client names one. */
  private async destinations(cityId: string, q: ItineraryFlightSearchDto) {
    const airports = await this.store.airportsInCity(cityId);
    if (airports) {
      if (!airports.length) throw new BadRequestException("No airport serves the first day's city");
      return airports.map((a) => ({ id: String(a._id), timeZone: timeZoneOf(a) ?? q.destinationTimeZone }));
    }
    if (!q.destinationAirportId)
      throw new BadRequestException('destinationAirportId is required until airports are seeded');
    return [{ id: q.destinationAirportId, timeZone: q.destinationTimeZone }];
  }
}