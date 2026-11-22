import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BLOG_LIMITS, PostStatus } from '../blog.constants.js';

// BLG-04, BLG-08
export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: BLOG_LIMITS.titleLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_LIMITS.titleLength)
  title?: string;

  @ApiPropertyOptional({ maxLength: BLOG_LIMITS.bodyLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_LIMITS.bodyLength)
  body?: string;

  @ApiPropertyOptional({ type: [String], maxItems: BLOG_LIMITS.tagCount, maxLength: BLOG_LIMITS.tagLength })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((tag: unknown) => (typeof tag === 'string' ? tag.trim().toLowerCase() : tag))
      : value,
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BLOG_LIMITS.tagCount)
  @IsString({ each: true })
  @MaxLength(BLOG_LIMITS.tagLength, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: PostStatus })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}
