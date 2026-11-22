import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, ProviderScope } from '../../auth/decorators.js';
import { ProviderType, Role } from '../../common/enums/index.js';
import { AvailabilityService } from './availability.service.js';
import { CreateAvailabilityDto } from '../dto/create-availability.dto.js';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto.js';

@ApiTags('Hotel Availability')
@Controller('hotels/:hotelId/rooms/:roomId/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  @ProviderScope(ProviderType.Hotel, 'hotelId')
  @Auth(Role.HotelModerator)
  @ApiOperation({ summary: 'Open a date range of nights for a room' })
  create(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.availabilityService.create(hotelId, roomId, dto);
  }

  @Patch()
  @ProviderScope(ProviderType.Hotel, 'hotelId')
  @Auth(Role.HotelModerator)
  @ApiOperation({
    summary: 'Block, unblock or reprice a date range for a room',
  })
  update(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.availabilityService.update(hotelId, roomId, dto);
  }
}
