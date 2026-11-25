import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId } from 'class-validator';
import { ReportTargetType } from '../blog.constants.js';

// GEN-09, GEN-10
export class ReportTargetParamDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  type: ReportTargetType;

  @ApiProperty({ description: 'Content MongoDB id' })
  @IsMongoId()
  id: string;
}
