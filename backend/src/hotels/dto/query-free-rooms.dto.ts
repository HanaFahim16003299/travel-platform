import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';
import { TenPerPageQueryDto } from './ten-per-page-query.dto.js';

// Changed by Mohamed Hesham: GEN-05, page / limit (max 10) come from TenPerPageQueryDto.
export class QueryFreeRoomsDto extends TenPerPageQueryDto {
  @ApiProperty({ example: '2026-12-01' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiProperty({
    example: '2026-12-10',
    description:
      'Exclusive: the check-out day, meaning the last night of the stay is the night before this date.',
  })
  @Type(() => Date)
  @IsDate()
  endDate: Date;
}
