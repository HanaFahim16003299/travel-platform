import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, ProviderScope } from '../auth/decorators.js';
import { Role, ProviderType } from '../common/enums/index.js';
import { AirlinesService } from './airlines.service.js';
import { CreateAirlineDto } from './dto/create-airline.dto.js';
import { UpdateAirlineDto } from './dto/update-airline.dto.js';
import { BaggagePolicyDto } from './dto/baggage-policy.dto.js';
import { CancellationPolicyDto } from './dto/cancellation-policy.dto.js';

@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlinesService: AirlinesService) {}

  @Post()
  @Auth(Role.Admin)
  create(@Body() dto: CreateAirlineDto) {
    return this.airlinesService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.airlinesService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.AirlineModerator)
  @ProviderScope(ProviderType.Airline)
  update(@Param('id') id: string, @Body() dto: UpdateAirlineDto) {
    return this.airlinesService.update(id, dto);
  }

  @Put(':id/baggage-policy')
  @Auth(Role.AirlineModerator)
  @ProviderScope(ProviderType.Airline)
  updateBaggagePolicy(@Param('id') id: string, @Body() dto: BaggagePolicyDto) {
    return this.airlinesService.updateBaggagePolicy(id, dto);
  }

  @Put(':id/cancellation-policy')
  @Auth(Role.AirlineModerator)
  @ProviderScope(ProviderType.Airline)
  updateCancellationPolicy(
    @Param('id') id: string,
    @Body() dto: CancellationPolicyDto,
  ) {
    return this.airlinesService.updateCancellationPolicy(id, dto);
  }
}
