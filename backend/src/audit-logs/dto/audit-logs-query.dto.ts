import { OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

/** Page and limit only: audit logs are always listed newest first. */
export class AuditLogsQueryDto extends OmitType(PaginationQueryDto, ['sort', 'order'] as const) {
  @ApiPropertyOptional({ description: 'Only actions by this user (user _id)' })
  @IsOptional()
  @IsMongoId()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Exact action name, for example "account.suspended"' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: 'Type of the affected item, for example "user" or "post"' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetType?: string;

  @ApiPropertyOptional({ description: 'From this date and time (ISO 8601), inclusive' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Up to this date and time (ISO 8601), inclusive' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
