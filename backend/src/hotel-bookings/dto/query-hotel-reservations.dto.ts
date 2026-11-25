import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

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
