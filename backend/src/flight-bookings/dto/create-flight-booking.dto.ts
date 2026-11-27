import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PassengerDto } from './passenger.dto.js';

export class SegmentSelectionDto {
  @ApiProperty() @IsMongoId() flightId: string;
  @ApiProperty() @IsMongoId() cabinId: string;
}

export class CreateFlightBookingDto {
  @ApiProperty({ type: SegmentSelectionDto })
  @ValidateNested()
  @Type(() => SegmentSelectionDto)
  outbound: SegmentSelectionDto;

  @ApiPropertyOptional({
    type: SegmentSelectionDto,
    description: 'Only for round trips',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentSelectionDto)
  inbound?: SegmentSelectionDto;

  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];
}
