import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  AirportsQueryDto,
  AttractionsQueryDto,
  CitiesQueryDto,
  ReferenceIdParamDto,
} from './dto/reference-queries.dto.js';
import { ReferenceDataService } from './reference-data.service.js';

/** Public, read-only reference data (GEN-12). No login needed, so guests can search flights. */
@ApiTags('Reference data')
@Controller()
export class ReferenceDataController {
  constructor(private readonly reference: ReferenceDataService) {}

  @Get('countries')
  @ApiOperation({ summary: 'GEN-12 List countries with their currency' })
  countries(@Query() query: PaginationQueryDto) {
    return this.reference.listCountries(query);
  }

  @Get('currencies')
  @ApiOperation({ summary: 'GEN-12 Supported currency codes (PAY-04, ACC-09)' })
  async currencies() {
    return { data: await this.reference.currencies() };
  }

  @Get('cities')
  @ApiOperation({ summary: 'GEN-12 List cities (filter by country or name)' })
  cities(@Query() query: CitiesQueryDto) {
    return this.reference.listCities(query);
  }

  @Get('airports')
  @ApiOperation({ summary: 'FLT-02 Predefined airport list (filter by country, city or text)' })
  airports(@Query() query: AirportsQueryDto) {
    return this.reference.listAirports(query);
  }

  @Get('airports/:id')
  @ApiOperation({ summary: 'FLT-02 One airport, including its IANA time zone' })
  @ApiNotFoundResponse({ description: 'Unknown airport' })
  async airport(@Param() { id }: ReferenceIdParamDto) {
    const airport = await this.reference.getAirport(id);
    if (!airport) throw new NotFoundException('Airport not found');
    return airport;
  }

  @Get('attractions')
  @ApiOperation({ summary: 'GEN-12 List attractions (filter by city or name)' })
  attractions(@Query() query: AttractionsQueryDto) {
    return this.reference.listAttractions(query);
  }
}
