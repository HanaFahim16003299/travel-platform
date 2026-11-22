import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BLOG_LIMITS, ReportStatus, ReportTargetType } from '../blog.constants.js';

// GEN-10
export class ListReportsQueryDto {
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

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportTargetType })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;
}
