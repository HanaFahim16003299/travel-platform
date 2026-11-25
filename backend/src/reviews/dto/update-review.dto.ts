
import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  ValidateIf,
  IsInt,
  IsString,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

import { Transform } from 'class-transformer';

export class UpdateReviewDto {
  @ApiPropertyOptional({
    example: 4,
    minimum: 1,
    maximum: 5,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    example: 'Very good hotel, but breakfast could improve.',
    minLength: 1,
    maxLength: 1000,
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  comment?: string;
}
