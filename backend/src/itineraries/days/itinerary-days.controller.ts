import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { Role } from '../../common/enums/index.js';
import { AddDayDto, ReorderDaysDto, UpdateDayDto } from '../dto/day.dto.js';
import { ItineraryDaysService } from './itinerary-days.service.js';

@ApiTags('Itinerary Days')
@Controller('itineraries/:id/days')
@Auth(Role.User) // ownership is checked in the store (loadOwned)
export class ItineraryDaysController {
  constructor(private readonly days: ItineraryDaysService) {}

  @Post()
  @ApiOperation({ summary: 'ITN-05 Add a day (append, or insert at "position")' })
  add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddDayDto) {
    return this.days.addDay(user, id, dto);
  }

  // MUST stay above ':dayId', otherwise the word "reorder" would be read as a day id.
  @Patch('reorder')
  @ApiOperation({ summary: 'ITN-08 Reorder days (send every day id in the new order)' })
  reorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReorderDaysDto) {
    return this.days.reorderDays(user, id, dto);
  }

  @Patch(':dayId')
  @ApiOperation({ summary: 'ITN-05 Edit a day (city, title, notes)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateDayDto,
  ) {
    return this.days.updateDay(user, id, dayId, dto);
  }

  @Delete(':dayId')
  @ApiOperation({ summary: 'ITN-07 Delete a day (later days are renumbered)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('dayId') dayId: string) {
    return this.days.deleteDay(user, id, dayId);
  }
}
//The front desk for days. All URLs start with /api/itineraries/{id}/days, so every day belongs to one trip ({id}).