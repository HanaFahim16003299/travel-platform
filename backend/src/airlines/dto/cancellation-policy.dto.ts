import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// FLT-09: one refund tier. Added by Joumana Hozayen.
export class CancellationTierDto {
  @ApiProperty({
    minimum: 0,
    description: 'Cancel at least this many days before departure',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysBefore: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description: 'Refund percentage for this tier',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercent: number;
}

export class CancellationPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cancellationFee?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cancellationDeadlineHours?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage?: number;

  // FLT-09: added by Joumana Hozayen.
  @ApiPropertyOptional({
    type: [CancellationTierDto],
    description:
      'FLT-09: refund tiers. The highest daysBefore not above the days left applies; no match = 0%. Each daysBefore must be unique.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  @ArrayUnique((tier: CancellationTierDto) => tier.daysBefore, {
    message: 'Each cancellation tier must have a different daysBefore',
  })
  tiers?: CancellationTierDto[];
}
