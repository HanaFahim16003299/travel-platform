import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import {
  IsMongoId,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsDateString,
  Matches,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class RoomSelectionDto {
  @ApiProperty()
  @IsMongoId()
  roomId: string;

  @ApiProperty({ example: 2, description: 'Adults assigned to this room' })
  @IsInt()
  @Min(0)
  adults: number;

  @ApiProperty({
    type: [Number],
    example: [5, 9],
    description: 'Ages (0-17) of the children assigned to this room',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  childrenAges: number[];
}

export class CreateHotelBookingDto {
  @ApiProperty()
  @IsMongoId()
  hotelId: string;

  @ApiProperty({ type: [RoomSelectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoomSelectionDto)
  rooms: RoomSelectionDto[];

  @ApiProperty({ example: '2026-12-10' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut: string;
}
