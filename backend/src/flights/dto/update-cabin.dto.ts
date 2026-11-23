import { PartialType } from '@nestjs/swagger';
import { CreateCabinDto } from './create-cabin.dto.js';

export class UpdateCabinDto extends PartialType(CreateCabinDto) {}
