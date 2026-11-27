import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

// page / limit come from PaginationQueryDto (sort / order are ignored here)
// Changed by Mohamed Hesham: GEN-05.
export class QueryAvailabilityDto extends PaginationQueryDto {
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
