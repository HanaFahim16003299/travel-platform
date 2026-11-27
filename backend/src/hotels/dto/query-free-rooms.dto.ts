import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

// Changed by Mohamed Hesham: GEN-05, page / limit come from PaginationQueryDto (default page size 10).
export class QueryFreeRoomsDto extends PaginationQueryDto {
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
