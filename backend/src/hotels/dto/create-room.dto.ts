import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RoomType } from '../constants/room-type.js';

export class CreateRoomDto {
  @ApiProperty({ example: 'Deluxe Suite' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: RoomType, example: RoomType.DOUBLE })
  @IsEnum(RoomType)
  type: RoomType;

  @ApiProperty({ minimum: 1, example: 2 })
  @IsInt()
  @Min(1)
  beds: number;

  @ApiProperty({ minimum: 1, example: 2 })
  @IsInt()
  @Min(1)
  maxAdults: number;

  @ApiPropertyOptional({ minimum: 0, default: 0, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxChildren?: number;
  //adding price per night to the room
  @ApiProperty({ minimum: 0.01, example: 150.0 })
  @IsNumber({ maxDecimalPlaces: 2 }) // pricePerNight must be a number with up to 2 decimal places
  @Min(0.01)
  pricePerNight: number;

  //adding amenities to the room
  @ApiPropertyOptional({
    type: [String],
    example: ['wifi', 'air conditioning'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];
}
