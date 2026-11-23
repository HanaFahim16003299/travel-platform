import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HotelSearchService } from './hotel-search.service.js';
import { QuerySearchHotelsDto } from '../dto/search-hotels.dto.js';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelSearchController {
  constructor(private readonly hotelSearchService: HotelSearchService) {}

  // public: no @Auth / @ProviderScope
  @Get('search')
  @ApiOperation({
    summary:
      'Search active hotels by destination, dates, guests and rooms (HTL-11, HTL-12)',
  })
  search(@Query() query: QuerySearchHotelsDto) {
    return this.hotelSearchService.search(query);
  }
}
