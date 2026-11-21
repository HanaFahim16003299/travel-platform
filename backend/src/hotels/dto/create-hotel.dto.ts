import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export class CreateHotelDto {
  @ApiProperty({ example: 'Grand Berlin Hotel' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'A modern hotel in the heart of the city.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'City id' })
  @IsMongoId()
  cityId: string;

  @ApiProperty({ example: 'Unter den Linden 1, 10117 Berlin' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  starRating?: number;

  @ApiProperty({ example: 'EUR', description: 'ISO 4217 currency code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' })
  currency: string;

  @ApiPropertyOptional({ type: [String], example: ['wifi', 'pool'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty({ example: '14:00', description: 'HH:mm, 24-hour' })
  @Matches(TIME_REGEX, { message: 'checkInTime must be HH:mm' })
  checkInTime: string;

  @ApiProperty({ example: '11:00', description: 'HH:mm, 24-hour' })
  @Matches(TIME_REGEX, { message: 'checkOutTime must be HH:mm' })
  checkOutTime: string;
}
