import { Controller, Get, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { BookingGatewayRegistry } from './booking-gateway.registry.js';
import { BookingType } from './enums/payment.enums.js';

@ApiTags('Booking Policies')
@Auth()
@Controller('bookings')
export class BookingPoliciesController {
  constructor(private readonly gatewayRegistry: BookingGatewayRegistry) {}

  @Get(':type/:id/policies')
  @ApiOperation({ summary: 'PAY-02 View applicable provider policies for a booking' })
  @ApiParam({ name: 'type', enum: BookingType })
  getPolicies(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
  ) {
    return this.gatewayRegistry.get(type).getPolicies(user, id);
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({ summary: 'PAY-02 Accept provider policies for a booking (stores timestamp)' })
  @ApiParam({ name: 'type', enum: BookingType })
  acceptPolicies(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
  ) {
    return this.gatewayRegistry.get(type).acceptPolicies(user, id);
  }
}
