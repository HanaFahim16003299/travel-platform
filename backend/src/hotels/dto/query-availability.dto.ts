import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';
import { TenPerPageQueryDto } from './ten-per-page-query.dto.js';

// page / limit (max 10, GEN-05) come from TenPerPageQueryDto (sort / order are ignored here)
// Changed by Mohamed Hesham: GEN-05.
export class QueryAvailabilityDto extends TenPerPageQueryDto {
  @ApiProperty({ example: '2026-12-01' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiProperty({
    example: '2026-12-10',
    description:
      'Exclusive: the last night shown is the night before this date.',
  })
  @Type(() => Date)
  @IsDate()
  endDate: Date;
}
