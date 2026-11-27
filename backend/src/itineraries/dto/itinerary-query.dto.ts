import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { CabinClass } from '../../flights/schemas/flight.schema.js';
import { DATE_ONLY_PATTERN } from '../itinerary.constants.js';

/** ITN-20/21: search public itineraries. Inherits page, limit, sort, order from the team's shared DTO. */
export class SearchPublicItinerariesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'berlin', description: 'Keyword in the title, a country name or a city name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Only itineraries that include this country' })
  @IsOptional()
  @IsMongoId()
  countryId?: string;

  @ApiPropertyOptional({ description: 'Only itineraries that visit this city' })
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minDays?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDays?: number;
}

/**
 * ITN-25: the user picks one city group and enters guests and rooms.
 * Check-in/check-out come from the group; the rest is passed to HotelSearchService (HTL-11/12).
 */
export class ItineraryHotelSearchDto extends PaginationQueryDto {
  @ApiProperty({ example: 1, description: 'Which city group (1 = first group in cityGroups)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  group: number;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  guests: number = 1;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  rooms: number = 1;

  // same sort options as Mohamed Hesham's hotel search
  @ApiPropertyOptional({ enum: ['price', 'rating'], default: 'price' })
  @IsOptional()
  @IsIn(['price', 'rating'])
  sort: 'price' | 'rating' = 'price';
}

/**
 * ITN-26: one-way or round-trip flights from a chosen origin airport to any airport
 * in the city of the itinerary's first day. Dates default to the first and last day.
 * Passed to Mahmoud's FlightsService.search (FLT-11/12), which uses airport ids.
 */
export class ItineraryFlightSearchDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Origin airport id (reference data)' })
  @IsMongoId()
  originAirportId: string;

  @ApiPropertyOptional({ enum: ['one-way', 'round-trip'], default: 'round-trip' })
  @IsOptional()
  @IsIn(['one-way', 'round-trip'])
  tripType: 'one-way' | 'round-trip' = 'round-trip';

  @ApiPropertyOptional({ example: '2026-12-20', description: 'Default: the itinerary start date' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'departureDate must be YYYY-MM-DD' })
  departureDate?: string;

  @ApiPropertyOptional({ example: '2027-01-02', description: "Round-trip only. Default: the last day's date" })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'returnDate must be YYYY-MM-DD' })
  returnDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults: number = 1;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  children: number = 0;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infants: number = 0;

  @ApiPropertyOptional({ enum: CabinClass })
  @IsOptional()
  @IsEnum(CabinClass)
  cabinClass?: CabinClass;

  // ---- Fallbacks, only used while the Airport reference data is not seeded yet ----
  @ApiPropertyOptional({ description: 'Only needed until airports are seeded: a destination airport id' })
  @IsOptional()
  @IsMongoId()
  destinationAirportId?: string;

  @ApiPropertyOptional({ example: 'Africa/Cairo', description: 'Only needed until airports are seeded' })
  @IsOptional()
  @IsString()
  originTimeZone?: string;

  @ApiPropertyOptional({ example: 'Europe/Berlin', description: 'Only needed until airports are seeded' })
  @IsOptional()
  @IsString()
  destinationTimeZone?: string;
}