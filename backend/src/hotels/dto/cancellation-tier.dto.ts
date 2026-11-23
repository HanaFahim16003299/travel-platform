import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CancellationTierDto {
  @ApiProperty({ minimum: 0, example: 2 })
  @IsInt()
  @Min(0)
  daysBeforeCheckIn: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercent: number;
}
