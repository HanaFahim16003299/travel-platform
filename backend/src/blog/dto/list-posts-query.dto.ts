import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BLOG_LIMITS } from '../blog.constants.js';

// BLG-02, BLG-03, BLG-08, BLG-09
export class ListPostsQueryDto {
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

  @ApiPropertyOptional({ maxLength: BLOG_LIMITS.tagLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsOptional()
  @IsString()
  @MaxLength(BLOG_LIMITS.tagLength)
  tag?: string;

  @ApiPropertyOptional({ maxLength: BLOG_LIMITS.searchLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(BLOG_LIMITS.searchLength)
  keyword?: string;
}
