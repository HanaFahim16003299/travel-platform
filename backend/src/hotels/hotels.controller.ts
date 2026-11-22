import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, ProviderScope } from '../auth/decorators.js';
import { ProviderType, Role } from '../common/enums/index.js';
import { HotelsService } from './hotels.service.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { UpdatePoliciesDto } from './dto/update-policies.dto.js';
import { AvailabilityService } from './availability/availability.service.js';
import { QueryAvailabilityDto } from './dto/query-availability.dto.js';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(
    private readonly hotelsService: HotelsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Post()
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Create a new hotel' })
  create(@Body() dto: CreateHotelDto) {
    return this.hotelsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a hotel by id' })
  findOne(@Param('id') id: string) {
    return this.hotelsService.findOne(id);
  }
  @Get(':id/availability')
  @Auth(Role.HotelModerator)
  @ProviderScope(ProviderType.Hotel)
  @ApiOperation({ summary: "View each room's status for a date range" })
  getAvailability(
    @Param('id') id: string,
    @Query() query: QueryAvailabilityDto,
  ) {
    return this.availabilityService.getHotelAvailability(id, query);
  }

  @Patch(':id')
  @Auth(Role.HotelModerator)
  @ProviderScope(ProviderType.Hotel)
  @ApiOperation({ summary: 'Update a hotel by id' })
  update(@Param('id') id: string, @Body() dto: UpdateHotelDto) {
    return this.hotelsService.update(id, dto);
  }

  @Put(':id/policies')
  @Auth(Role.HotelModerator)
  @ProviderScope(ProviderType.Hotel)
  @ApiOperation({
    summary: "Replace a hotel's check-in/out times and cancellation policy",
  })
  updatePolicies(@Param('id') id: string, @Body() dto: UpdatePoliciesDto) {
    return this.hotelsService.updatePolicies(id, dto);
  }
}
