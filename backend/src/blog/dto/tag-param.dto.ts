import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { BLOG_LIMITS } from '../blog.constants.js';

// BLG-08
export class TagParamDto {
  @ApiProperty({ maxLength: BLOG_LIMITS.tagLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_LIMITS.tagLength)
  tag: string;
}
