import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PassengerType } from '../flight-booking.enums.js';

export class PassengerDto {
  @ApiProperty({ example: 'Sara' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Ali' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: '1998-04-12' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ example: 'A12345678', description: 'Passport or ID number' })
  @IsString() @IsNotEmpty() @MaxLength(30)
  documentNumber: string;

  @ApiProperty({ enum: PassengerType })
  @IsEnum(PassengerType)
  type: PassengerType;

  @ApiPropertyOptional({ description: 'Required for adults' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Required for adults' })
  @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0)
  extraBags?: number;
}