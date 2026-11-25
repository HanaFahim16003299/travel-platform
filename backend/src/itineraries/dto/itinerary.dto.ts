import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DATE_ONLY_PATTERN, ItineraryVisibility, MAX_ITINERARY_DAYS } from '../itinerary.constants.js';
import { CreateDayDto } from './day.dto.js';

/** ITN-01: create an itinerary. Days are optional here; they can also be added later (ITN-05). */
export class CreateItineraryDto {
  @ApiProperty({ example: 'Two weeks in Germany' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ example: 'Castles, beer gardens and museums.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: [String], example: ['507f1f77bcf86cd799439011'], description: 'Country ids (reference data)' })
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  countryIds: string[];

  @ApiProperty({ example: '2026-12-20', description: 'YYYY-MM-DD. Day 1 falls on this date.' })
  @Matches(DATE_ONLY_PATTERN, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiPropertyOptional({ enum: ItineraryVisibility, default: ItineraryVisibility.Private })
  @IsOptional()
  @IsEnum(ItineraryVisibility)
  visibility?: ItineraryVisibility;

  @ApiPropertyOptional({ type: [CreateDayDto], description: 'Optional initial days, in order' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ITINERARY_DAYS)
  @ValidateNested({ each: true })
  @Type(() => CreateDayDto)
  days?: CreateDayDto[];
}

/** ITN-01 / ITN-20: edit fields or publish (visibility: "public"). Days are edited through their own endpoints. */
// OmitType removes "days"; because main.ts sets forbidNonWhitelisted, sending "days" here returns 400 automatically.
export class UpdateItineraryDto extends PartialType(OmitType(CreateItineraryDto, ['days'] as const)) {}

/** ITN-21: optional overrides when cloning. */
export class CloneItineraryDto {
  @ApiPropertyOptional({ example: 'My version of Two weeks in Germany' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: '2027-03-01', description: 'YYYY-MM-DD. Defaults to the original start date.' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;
}