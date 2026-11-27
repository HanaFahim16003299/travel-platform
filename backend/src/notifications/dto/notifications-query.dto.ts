import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

/** Page and limit only: notifications are always listed newest first. */
export class NotificationsQueryDto extends OmitType(PaginationQueryDto, ['sort', 'order'] as const) {
  @ApiPropertyOptional({ description: 'true = only unread notifications', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread: boolean = false;
}

export class NotificationIdParamDto {
  @IsMongoId()
  id: string;
}
