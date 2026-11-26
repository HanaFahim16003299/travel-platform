import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TenPerPageQueryDto } from './ten-per-page-query.dto.js';

// GEN-05: page / limit (max 10) come from TenPerPageQueryDto
// Changed by Mohamed Hesham: GEN-05.
export class QuerySearchHotelsDto extends TenPerPageQueryDto {
  // Changed by Mohamed Hesham: HTL-11. The destination is a city or country
  // name, or (for other modules) a city id. Exactly one of the two is required;
  // the service answers 400 otherwise.
  @ApiPropertyOptional({
    example: 'Cairo',
    description: 'City or country name (or a country code such as EG)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  destination?: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'A city id, instead of destination',
  })
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiProperty({ example: '2026-12-01' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiProperty({
    example: '2026-12-10',
    description:
      'Exclusive: the last night of the stay is the night before this date.',
  })
  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests: number = 1;

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rooms: number = 1;

  @ApiPropertyOptional({ minimum: 0, example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0, example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  // overrides PaginationQueryDto.sort: only these two fields are sortable here
  @ApiPropertyOptional({ enum: ['price', 'rating'], default: 'price' })
  @IsOptional()
  @IsIn(['price', 'rating'])
  sort: 'price' | 'rating' = 'price';
}
