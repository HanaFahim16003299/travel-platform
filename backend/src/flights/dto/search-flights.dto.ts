import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { CabinClass } from '../schemas/flight.schema.js';

export class SearchFlightsDto {
  @ApiProperty()
  @IsMongoId()
  departureAirportId: string;

  @ApiProperty()
  @IsMongoId()
  arrivalAirportId: string;

  @ValidateIf((value: SearchFlightsDto) => Boolean(value.departureDate))
  @ApiPropertyOptional({ format: 'date', example: '2026-11-27' })
  @IsDateString({ strict: true })
  departureDate?: string;

  @ValidateIf((value: SearchFlightsDto) => Boolean(value.departureDate))
  @ApiPropertyOptional({
    example: 'Africa/Cairo',
    description: 'IANA time zone of the departure airport',
  })
  @IsString()
  departureTimeZone?: string;

  @ValidateIf((value: SearchFlightsDto) => Boolean(value.returnDate))
  @ApiPropertyOptional({ format: 'date', example: '2026-11-30' })
  @IsDateString({ strict: true })
  returnDate?: string;

  @ValidateIf((value: SearchFlightsDto) => Boolean(value.returnDate))
  @ApiPropertyOptional({
    example: 'Europe/London',
    description: 'IANA time zone of the return departure airport',
  })
  @IsString()
  returnTimeZone?: string;

  @IsOptional()
  @ApiPropertyOptional({ enum: CabinClass })
  @IsEnum(CabinClass)
  cabinClass?: CabinClass;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 1, maximum: 9, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  passengers: number = 1;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 1, maximum: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adultCount?: number;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  childCount?: number;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infantCount?: number;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @ApiPropertyOptional({
    enum: ['departureTime', 'price'],
    default: 'departureTime',
  })
  @IsIn(['departureTime', 'price'])
  sortBy: 'departureTime' | 'price' = 'departureTime';

  @IsOptional()
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
