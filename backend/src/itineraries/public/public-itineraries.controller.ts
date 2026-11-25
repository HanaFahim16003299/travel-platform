import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { Role } from '../../common/enums/index.js';
import { CloneItineraryDto } from '../dto/itinerary.dto.js';
import { SearchPublicItinerariesDto } from '../dto/itinerary-query.dto.js';
import { PublicItinerariesService } from './public-itineraries.service.js';

@ApiTags('Public Itineraries')
@Controller('itineraries')
export class PublicItinerariesController {
  constructor(private readonly publicItineraries: PublicItinerariesService) {}

  @Get('public/search')
  @ApiOperation({ summary: 'ITN-21 Search public itineraries by keyword, country, city, days (no login)' })
  search(@Query() query: SearchPublicItinerariesDto) {
    return this.publicItineraries.search(query);
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'ITN-21 View a public itinerary, read-only (no login)' })
  view(@Param('id') id: string) {
    return this.publicItineraries.view(id);
  }

  @Post(':id/clone')
  @Auth(Role.User)
  @ApiOperation({ summary: 'ITN-21 Clone a public itinerary into my own private copy' })
  clone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CloneItineraryDto) {
    return this.publicItineraries.clone(user, id, dto);
  }
}