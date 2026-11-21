import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, ProviderScope } from '../auth/decorators.js';
import { ProviderType, Role } from '../common/enums/index.js';
import { HotelsService } from './hotels.service.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';

@ApiTags('Hotels')
@Controller('hotels')

export class HotelsController {
    constructor(private readonly hotelsService: HotelsService) {}

    @Post()
    @Auth(Role.Admin)
    @ApiOperation({ summary: 'Create a new hotel' })
     create(@Body() dto: CreateHotelDto) {
        return this.hotelsService.create(dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a hotel by id' })
    findOne(@Param('id') id: string) {
        return this.hotelsService.findOne(id);
    }
    @Patch(':id')
    @Auth(Role.HotelModerator)
    @ProviderScope(ProviderType.Hotel)
    @ApiOperation({ summary: 'Update a hotel by id' })
    update(@Param('id') id: string, @Body() dto: UpdateHotelDto) {
        return this.hotelsService.update(id, dto);
    }
}
