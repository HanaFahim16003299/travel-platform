import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

// Created by Mohamed Hesham: HTL-02. Both dates are optional; when they are sent
// together, the hotel details also list the rooms free for those dates
// (page / limit apply to that room list).
export class QueryHotelDetailsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Check-in day. Send it together with endDate.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    example: '2026-12-10',
    description:
      'Exclusive: the check-out day, meaning the last night of the stay is the night before this date.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
