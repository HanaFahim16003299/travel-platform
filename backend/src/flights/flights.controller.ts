import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { CreateFlightDto } from './dto/create-flight.dto.js';
import { UpdateFlightDto } from './dto/update-flight.dto.js';
import { CreateCabinDto } from './dto/create-cabin.dto.js';
import { UpdateCabinDto } from './dto/update-cabin.dto.js';
import { SearchFlightsDto } from './dto/search-flights.dto.js';
import { FlightsService } from './flights.service.js';

@ApiTags('Flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  @Post()
  @Auth(Role.AirlineModerator, Role.Admin)
  create(@Body() dto: CreateFlightDto, @CurrentUser() user: AuthUser) {
    return this.flightsService.create(dto, user);
  }

  @Get('search')
  search(@Query() query: SearchFlightsDto) {
    return this.flightsService.search(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.flightsService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.AirlineModerator, Role.Admin)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFlightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.flightsService.update(id, dto, user);
  }

  @Post(':id/cancel')
  @Auth(Role.AirlineModerator, Role.Admin)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.flightsService.cancel(id, user);
  }

  @Post(':id/cabins')
  @Auth(Role.AirlineModerator, Role.Admin)
  addCabin(
    @Param('id') id: string,
    @Body() dto: CreateCabinDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.flightsService.addCabin(id, dto, user);
  }

  @Patch(':id/cabins/:cabinId')
  @Auth(Role.AirlineModerator, Role.Admin)
  updateCabin(
    @Param('id') id: string,
    @Param('cabinId') cabinId: string,
    @Body() dto: UpdateCabinDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.flightsService.updateCabin(id, cabinId, dto, user);
  }

  @Get(':id/bookings')
  @Auth(Role.AirlineModerator, Role.Admin)
  bookings(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.flightsService.bookings(id, user, query);
  }

  @Get(':id/passengers/export')
  @Auth(Role.AirlineModerator, Role.Admin)
  exportPassengers(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    return this.flightsService.exportPassengers(id, user, response);
  }
}
