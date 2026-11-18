import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../common/password.js';

export class RegisterDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) password: string;
  @ApiProperty() @IsString() @MaxLength(50) firstName: string;
  @ApiProperty() @IsString() @MaxLength(50) lastName: string;
}
export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
}
export class ChangePasswordDto {
  @ApiProperty() @IsString() currentPassword: string;
  @ApiProperty() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) newPassword: string;
}
