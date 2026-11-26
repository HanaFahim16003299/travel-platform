import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class HoldFlightBookingDto {
  @ApiProperty({ description: 'Id of your DRAFT booking' })
  @IsMongoId()
  bookingId: string;
}
