import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

// Created by Mohamed Hesham: GEN-05 says the page size is 10, so no hotel list may return
// more than 10 rows per page. The shared PaginationQueryDto allows up to 100,
// so this class narrows the limit for the hotel lists only.
export class TenPerPageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 10;
}
