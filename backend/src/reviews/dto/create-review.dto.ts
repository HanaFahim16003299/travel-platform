
import { ApiProperty } from '@nestjs/swagger';

import {
  IsInt,
  IsString,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

import { Transform } from 'class-transformer';

export class CreateReviewDto {
  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    example: 'Excellent hotel and very comfortable rooms.',
    minLength: 1,
    maxLength: 1000,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  comment: string;
}
