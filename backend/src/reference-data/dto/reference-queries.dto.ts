import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only cities of this country, for example EG', example: 'EG' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional({ description: 'Search by city name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AirportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by IATA code, airport name or city name', example: 'cairo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Only airports of this country, for example EG', example: 'EG' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional({ description: 'Only airports of this city (City _id from GET /api/cities)' })
  @IsOptional()
  @IsMongoId()
  cityId?: string;
}

export class AttractionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only attractions of this city (City _id from GET /api/cities)' })
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiPropertyOptional({ description: 'Search by attraction name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ReferenceIdParamDto {
  @ApiPropertyOptional({ description: 'MongoDB _id' })
  @IsMongoId()
  id: string;
}
