import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId } from 'class-validator';
import { BookingType } from '../enums/payment.enums.js';

export class CreatePaymentDto {
  @ApiProperty({ enum: BookingType, example: BookingType.Flight })
  @IsEnum(BookingType)
  bookingType: BookingType;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsMongoId()
  bookingId: string;
}
