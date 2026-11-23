import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { BLOG_LIMITS } from '../blog.constants.js';

// BLG-05
export class CreateCommentDto {
  @ApiProperty({ maxLength: BLOG_LIMITS.commentLength })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_LIMITS.commentLength)
  content: string;
}
