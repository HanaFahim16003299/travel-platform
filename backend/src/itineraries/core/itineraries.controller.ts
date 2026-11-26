import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { Role } from '../../common/enums/index.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { CreateItineraryDto, UpdateItineraryDto } from '../dto/itinerary.dto.js';
import { ItinerariesService } from './itineraries.service.js';

@ApiTags('Itineraries')
@Controller('itineraries')
@Auth(Role.User) // logged-in traveler; "is it yours?" is checked in the store (loadOwned)
export class ItinerariesController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Post()
  @ApiOperation({ summary: 'ITN-01 Create an itinerary (private by default)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItineraryDto) {
    return this.itineraries.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'ITN-03 List my itineraries (most recently updated first)' })
  findMine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.itineraries.findMine(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ITN-03 View one of my itineraries (owner only)' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.itineraries.findMineById(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ITN-01/20 Edit an itinerary, or set visibility public/private' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateItineraryDto) {
    return this.itineraries.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ITN-01 Delete an itinerary (and its activities/budgets)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.itineraries.remove(user, id);
  }
}
//The controller is the front desk. It doesn't do any work itself. It reads the request, says who is asking, and passes it to the worker (A3)