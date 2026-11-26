import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class BaggagePolicyDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  carryOnBags?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  checkedBags?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  checkedBagWeightKg?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  carryOnWeightKg?: number;

  // FLT-08: added by Joumana Hozayen.
  @ApiPropertyOptional({
    description:
      'FLT-08: price of one extra checked bag (must be greater than 0)',
    minimum: 0,
    exclusiveMinimum: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  extraBagPrice?: number;

  // FLT-08: added by Joumana Hozayen.
  @ApiPropertyOptional({
    description: 'FLT-08: maximum extra bags per passenger (0 = no extra bags)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxExtraBags?: number;
}
