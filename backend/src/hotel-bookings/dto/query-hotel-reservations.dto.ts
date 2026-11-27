import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

// Created by Mohamed Hesham: HTL-22 query parameters (pagination + status filter).
// Changed by Mohamed Hesham: GEN-05, the default page size is 10 (shared PaginationQueryDto).
export class QueryHotelReservationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: BookingStatus,
    description:
      'Show only reservations with this status. Expired ones are hidden unless you ask for them.',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
