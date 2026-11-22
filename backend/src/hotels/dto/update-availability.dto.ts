import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum } from 'class-validator';

export enum AvailabilityAction {
  BLOCK = 'BLOCK',
  UNBLOCK = 'UNBLOCK',
  REMOVE = 'REMOVE',
}

export class UpdateAvailabilityDto {
  @ApiProperty({ example: '2026-12-01' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiProperty({
    example: '2026-12-10',
    description: 'Exclusive: the last night affected is the night before this date.',
  })
  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @ApiProperty({
    enum: AvailabilityAction,
    example: AvailabilityAction.BLOCK,
    description:
      'BLOCK closes the nights, UNBLOCK reopens them, REMOVE deletes them (no longer bookable).',
  })
  @IsEnum(AvailabilityAction)
  action: AvailabilityAction;
}