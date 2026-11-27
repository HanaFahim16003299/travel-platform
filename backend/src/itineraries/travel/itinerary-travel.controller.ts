import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { Role } from '../../common/enums/index.js';
import { ItineraryFlightSearchDto, ItineraryHotelSearchDto } from '../dto/itinerary-query.dto.js';
import { ItineraryTravelService } from './itinerary-travel.service.js';

@ApiTags('Itinerary Travel Search')
@Controller('itineraries/:id')
@Auth(Role.User)
export class ItineraryTravelController {
  constructor(private readonly travel: ItineraryTravelService) {}

  @Get('hotels')
  @ApiOperation({ summary: 'ITN-25 Hotels for one city group (check-in = first day, check-out = day after last)' })
  hotels(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: ItineraryHotelSearchDto) {
    return this.travel.hotels(user, id, q);
  }

  @Get('flights')
  @ApiOperation({ summary: "ITN-26 One-way/round-trip flights from an origin airport to the first day's city" })
  flights(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: ItineraryFlightSearchDto) {
    return this.travel.flights(user, id, q);
  }
}