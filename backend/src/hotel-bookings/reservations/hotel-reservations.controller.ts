import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, ProviderScope } from '../../auth/decorators.js';
import { ProviderType, Role } from '../../common/enums/index.js';
import { QueryHotelReservationsDto } from '../dto/query-hotel-reservations.dto.js';
import { HotelReservationsService } from './hotel-reservations.service.js';

@ApiTags('Hotel Reservations')
@Controller('hotels/:hotelId/reservations')
export class HotelReservationsController {
  constructor(private readonly reservationsService: HotelReservationsService) {}

  @Get()
  @ProviderScope(ProviderType.Hotel, 'hotelId')
  @Auth(Role.HotelModerator)
  @ApiOperation({ summary: "List a hotel's reservations (HTL-22)" })
  findAll(
    @Param('hotelId') hotelId: string,
    @Query() query: QueryHotelReservationsDto,
  ) {
    return this.reservationsService.findForHotel(hotelId, query);
  }
}
