import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';

import { HotelBookingsService } from './hotel-bookings.service.js';

import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';

import {
  Auth,
  CurrentUser,
} from '../auth/decorators.js';

import type { AuthUser } from '../auth/decorators.js';

import { Role } from '../common/enums/index.js';

import {
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';

@ApiTags('Hotel Bookings')
@Controller('hotel-bookings')
@Auth(Role.User)
export class HotelBookingsController {
  constructor(
    private readonly hotelBookingsService: HotelBookingsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a hotel booking' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHotelBookingDto,
  ) {
    return this.hotelBookingsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my hotel bookings' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.hotelBookingsService.findAll(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a hotel booking by ID' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hotelBookingsService.findOne(user.id, id);
  }

  @Post(':id/cancel')
@ApiOperation({
  summary: 'Cancel a hotel booking (refund per hotel policy if paid)',
})  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.hotelBookingsService.cancel(user.id, id);
  }
}