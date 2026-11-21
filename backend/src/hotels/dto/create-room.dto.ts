import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: 'Deluxe Suite' })
  @IsString()
  @IsNotEmpty()
  name: string;

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
  @ApiProperty({ minimum: 0, example: 150.0 })
  @IsNumber({ maxDecimalPlaces: 2 }) // pricePerNight must be a number with up to 2 decimal places
  @Min(0)
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
