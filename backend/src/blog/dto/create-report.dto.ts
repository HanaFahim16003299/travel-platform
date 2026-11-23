import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { BLOG_LIMITS } from '../blog.constants.js';

// GEN-09
export class CreateReportDto {
  @ApiProperty({
    description: 'Free-text reason for reporting the content',
    maxLength: BLOG_LIMITS.reportReasonLength,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_LIMITS.reportReasonLength)
  reason: string;
}
