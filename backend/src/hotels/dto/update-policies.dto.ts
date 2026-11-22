import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, Matches, ValidateNested } from 'class-validator';
import { TIME_REGEX } from '../constants/time-regex.js';
import { CancellationTierDto } from './cancellation-tier.dto.js';

export class UpdatePoliciesDto {
  @ApiProperty({ example: '14:00', description: 'HH:mm, 24-hour' })
  @Matches(TIME_REGEX, { message: 'checkInTime must be HH:mm' })
  checkInTime: string;

  @ApiProperty({ example: '11:00', description: 'HH:mm, 24-hour' })
  @Matches(TIME_REGEX, { message: 'checkOutTime must be HH:mm' })
  checkOutTime: string;

  @ApiProperty({ type: [CancellationTierDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  cancellationTiers: CancellationTierDto[];
}
