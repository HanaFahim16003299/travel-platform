import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { CabinClass } from '../schemas/flight.schema.js';

export class CreateFlightCabinDto {
  @ApiProperty({ enum: CabinClass })
  @IsEnum(CabinClass)
  cabinClass: CabinClass;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: 'USD', minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class CreateFlightDto {
  @ApiProperty({ description: 'Existing airline MongoDB ID' })
  @IsMongoId()
  airlineId: string;

  @ApiProperty()
  @IsString()
  @Length(2, 20)
  flightNumber: string;

  @ApiProperty({ description: 'Airport API MongoDB ID' })
  @IsMongoId()
  departureAirportId: string;

  @ApiProperty({ description: 'Airport API MongoDB ID' })
  @IsMongoId()
  arrivalAirportId: string;

  @ApiProperty({
    format: 'date-time',
    description: 'ISO 8601 timestamp with timezone offset',
  })
  @IsDateString()
  departureTime: string;

  @ApiProperty({
    format: 'date-time',
    description: 'ISO 8601 timestamp with timezone offset',
  })
  @IsDateString()
  arrivalTime: string;

  @ApiProperty({ type: [CreateFlightCabinDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFlightCabinDto)
  cabins: CreateFlightCabinDto[];
}
