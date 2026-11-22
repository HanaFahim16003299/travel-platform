import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate} from 'class-validator';

export class CreateAvailabilityDto {
  @ApiProperty({ example: '2026-12-01' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  
    @ApiProperty({ example: '2026-12-10',description: 'The end date is exclusive, meaning the last night of availability is the night before this date.' })
    @Type(() => Date)
    @IsDate()
    endDate: Date;
}

