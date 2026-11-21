import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateHotelDto } from './create-hotel.dto.js';

// every field optional; currency can't change after creation because
// existing room prices are plain numbers and would be silently re-priced
export class UpdateHotelDto extends PartialType(
  OmitType(CreateHotelDto, ['currency'] as const),
) {}