import { ApiProperty } from '@nestjs/swagger';

import {
  IsMongoId,
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
  IsDateString,
  Matches,
  IsInt,
  Min,
} from 'class-validator';

export class CreateHotelBookingDto {
  @ApiProperty()
  @IsMongoId()
  hotelId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  roomIds: string[];

  @ApiProperty({ example: '2026-12-10' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  guests: number;
}