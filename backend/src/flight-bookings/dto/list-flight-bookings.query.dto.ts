import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListFlightBookingsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'] })
  @IsOptional() @IsIn(['upcoming', 'past', 'cancelled'])
  group?: 'upcoming' | 'past' | 'cancelled';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 10;
}