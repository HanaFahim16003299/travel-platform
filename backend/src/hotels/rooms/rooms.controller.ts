import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, ProviderScope } from '../../auth/decorators.js';
import { ProviderType, Role } from '../../common/enums/index.js';
import { RoomsService } from './rooms.service.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';
import { UpdateRoomDto } from '../dto/update-room.dto.js';
import { QueryFreeRoomsDto } from '../dto/query-free-rooms.dto.js';
@ApiTags('Hotel Rooms')
@Controller('hotels/:hotelId/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}
  @Post()
  @ProviderScope(ProviderType.Hotel, 'hotelId')
  @Auth(Role.HotelModerator)
  @ApiOperation({ summary: 'Create a new room for a specific hotel' })
  create(@Param('hotelId') hotelId: string, @Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(hotelId, dto);
  }

  // public: no @Auth / @ProviderScope
  @Get('available')
  @ApiOperation({ summary: 'List rooms free for a date range, with prices' })
  findAvailable(
    @Param('hotelId') hotelId: string,
    @Query() query: QueryFreeRoomsDto,
  ) {
    return this.roomsService.findAvailableRooms(hotelId, query);
  }

  @Patch(':roomId')
  @ProviderScope(ProviderType.Hotel, 'hotelId')
  @Auth(Role.HotelModerator)
  @ApiOperation({ summary: 'Update a room for a specific hotel' })
  update(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.updateRoom(hotelId, roomId, dto);
  }

  @Delete(':roomId')
  @ProviderScope(ProviderType.Hotel, 'hotelId')
  @Auth(Role.HotelModerator)
  @ApiOperation({ summary: 'Delete a room for a specific hotel' })
  delete(@Param('hotelId') hotelId: string, @Param('roomId') roomId: string) {
    return this.roomsService.deleteRoom(hotelId, roomId);
  }
}
