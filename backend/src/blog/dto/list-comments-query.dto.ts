import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { BLOG_LIMITS } from '../blog.constants.js';

// BLG-05
export class ListCommentsQueryDto {
  @ApiPropertyOptional({ default: BLOG_LIMITS.defaultPage, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = BLOG_LIMITS.defaultPage;

  @ApiPropertyOptional({
    default: BLOG_LIMITS.defaultPageSize,
    minimum: 1,
    maximum: BLOG_LIMITS.maxPageSize,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BLOG_LIMITS.maxPageSize)
  limit = BLOG_LIMITS.defaultPageSize;
}
