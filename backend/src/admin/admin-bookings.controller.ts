import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { ListAdminBookingsQueryDto } from './dto/list-admin-bookings.query.dto.js';

@ApiTags('Admin - Bookings')
@Auth(Role.Admin)
@Controller('admin')
export class AdminBookingsController {
  constructor(private readonly adminBookingsService: AdminBookingsService) {}

  @Get('bookings')
  @ApiOperation({ summary: 'ACC-17 List all flight and hotel bookings' })
  list(@Query() query: ListAdminBookingsQueryDto) {
    return this.adminBookingsService.listBookings(query);
  }
}
