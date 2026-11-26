import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenPerPageQueryDto } from '../../hotels/dto/ten-per-page-query.dto.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

// Created by Mohamed Hesham: HTL-22 query parameters (pagination + status filter).
// Changed by Mohamed Hesham: GEN-05, page size is capped at 10.
export class QueryHotelReservationsDto extends TenPerPageQueryDto {
  @ApiPropertyOptional({
    enum: BookingStatus,
    description:
      'Show only reservations with this status. Expired ones are hidden unless you ask for them.',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
