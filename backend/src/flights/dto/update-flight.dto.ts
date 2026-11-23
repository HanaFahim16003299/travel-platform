import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFlightDto } from './create-flight.dto.js';

export class UpdateFlightDto extends PartialType(
  OmitType(CreateFlightDto, ['cabins'] as const),
) {}
