import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListFlightBookingsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'] })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'cancelled'])
  group?: 'upcoming' | 'past' | 'cancelled';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // GEN-05: 10 bookings per page, like the rest of the project (review C6, Joumana Hozayen).
  @ApiPropertyOptional({
    default: 10,
    maximum: 10,
    description: 'GEN-05: page size, at most 10',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 10;
}
