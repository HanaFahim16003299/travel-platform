//This file decides what the user is allowed to send when adding, editing or reordering days.
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** ITN-05: add a day. Note there is NO dayNumber or date field: the server derives them. */
export class CreateDayDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439022', description: 'City id (reference data)' })
  @IsMongoId()
  cityId: string;

  @ApiPropertyOptional({ example: 'Old town walking tour' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 'Buy museum pass online' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AddDayDto extends CreateDayDto {
  @ApiPropertyOptional({ example: 2, description: 'Insert as this day number (1-based). Default: append at the end.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;
}

/** ITN-05: edit a day's city, title or notes. To move a day, use reorder. */
export class UpdateDayDto extends PartialType(CreateDayDto) {}

/** ITN-08: the full list of day ids in the new order. Must contain every day exactly once. */
export class ReorderDaysDto {
  @ApiProperty({ type: [String], example: ['665f...c3', '665f...a1', '665f...b2'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsMongoId({ each: true })
  dayIds: string[];
}
//A DTO is a form with rules. Before a request reaches your code, NestJS checks the form automatically, and anything wrong is rejected with 400. Your code never sees bad data