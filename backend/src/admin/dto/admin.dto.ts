import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsMongoId, IsOptional, IsString, Matches, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AccountStatus, ProviderType, Role } from '../../common/enums/index.js';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../common/password.js';

export class CreateModeratorDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) password: string;
  @ApiProperty() @IsString() @MaxLength(50) firstName: string;
  @ApiProperty() @IsString() @MaxLength(50) lastName: string;
  @ApiProperty({ enum: ProviderType }) @IsEnum(ProviderType) providerType: ProviderType;
  @ApiProperty() @IsMongoId() providerId: string;
}
export class ListAccountsQuery {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: AccountStatus }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class SuspendDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ListProvidersQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
