import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { BLOG_LIMITS, ReportAction } from '../blog.constants.js';

// GEN-10
export class ReviewReportDto {
  @ApiProperty({ enum: ReportAction })
  @IsEnum(ReportAction)
  action: ReportAction;

  @ApiPropertyOptional({ maxLength: BLOG_LIMITS.adminNoteLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_LIMITS.adminNoteLength)
  adminNote?: string;
}
