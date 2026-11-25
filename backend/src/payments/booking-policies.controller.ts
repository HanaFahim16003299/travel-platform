import { Controller, Get, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { BookingType } from './enums/payment.enums.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Booking Policies')
@Auth()
@Controller('bookings')
export class BookingPoliciesController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':type/:id/policies')
  @ApiOperation({ summary: 'PAY-02 View applicable provider policies for a booking' })
  @ApiParam({ name: 'type', enum: BookingType })
  getPolicies(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
  ) {
    return this.paymentsService.getBookingPolicies(user, type, id);
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({ summary: 'PAY-02 Accept provider policies for a booking (stores timestamp)' })
  @ApiParam({ name: 'type', enum: BookingType })
  acceptPolicies(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
  ) {
    return this.paymentsService.acceptBookingPolicies(user, type, id);
  }
}
