import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PassengerType } from '../flight-booking.enums.js';

export class PassengerDto {
  @ApiProperty({ example: 'Sara' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Ali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName: string;

  // Strict calendar date: 1998-02-30 is rejected instead of rolling over to 2 March
  // (review C1, Joumana Hozayen).
  @ApiProperty({
    example: '1998-04-12',
    description:
      'Date of birth as YYYY-MM-DD; impossible dates such as 1998-02-30 are rejected',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateOfBirth must be a date in YYYY-MM-DD format',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  dateOfBirth: string;

  @ApiProperty({ example: 'A12345678', description: 'Passport or ID number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  documentNumber: string;

  @ApiProperty({ enum: PassengerType })
  @IsEnum(PassengerType)
  type: PassengerType;

  @ApiPropertyOptional({
    description: 'Optional contact (FLT-19 does not require it)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Optional contact (FLT-19 does not require it)',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  extraBags?: number;
}
