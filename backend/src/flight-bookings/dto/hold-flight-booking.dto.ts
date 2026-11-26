import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsMongoId } from 'class-validator';

export class HoldFlightBookingDto {
  @ApiProperty({ description: 'Id of your DRAFT booking' })
  @IsMongoId()
  bookingId: string;

  // PAY-02: added by Joumana Hozayen (review B2).
  @ApiProperty({
    description:
      "PAY-02: must be true. Confirms you accepted the airline's baggage and cancellation policies shown in the booking summary. The time of acceptance is stored on the booking.",
    example: true,
  })
  @IsBoolean()
  acceptPolicies: boolean;
}
