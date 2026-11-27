import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { FlightBookingsService } from './flight-bookings.service.js';
import { ETicketService } from './e-ticket.service.js';
import { CreateFlightBookingDto } from './dto/create-flight-booking.dto.js';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto.js';
import { ListFlightBookingsQueryDto } from './dto/list-flight-bookings.query.dto.js';

@ApiTags('Flight Bookings')
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(
    private readonly service: FlightBookingsService,
    private readonly eTicket: ETicketService,
  ) {}

  @Post()
  @Auth(Role.User)
  @ApiOperation({
    summary:
      'FLT-19 / FLT-21: enter passengers and extra bags, get the booking summary (no seats held yet)',
  })
  @ApiBadRequestResponse({ description: 'Passenger rules or bag limit broken' })
  @ApiConflictResponse({
    description: 'Flight not bookable or not enough seats',
  })
  @ApiResponse({
    status: 429,
    description: 'You already have 5 unfinished (draft) bookings',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlightBookingDto) {
    return this.service.createDraft(user, dto);
  }

  @Post('hold')
  @Auth(Role.User)
  @ApiOperation({
    summary:
      'FLT-22 / PAY-02: accept the airline policies and hold the seats for 10 minutes (status becomes PENDING_PAYMENT)',
  })
  @ApiBadRequestResponse({ description: 'Policies not accepted' })
  @ApiConflictResponse({
    description:
      'Not enough seats, already on hold, or the price/policies changed since the summary (the draft is updated; review it and hold again)',
  })
  @ApiResponse({
    status: 429,
    description: 'You already hold seats for 2 unpaid bookings',
  })
  @ApiNotFoundResponse({ description: 'Draft not found' })
  hold(@CurrentUser() user: AuthUser, @Body() dto: HoldFlightBookingDto) {
    return this.service.hold(user, dto.bookingId, dto.acceptPolicies);
  }

  @Get()
  @Auth(Role.User)
  @ApiOperation({
    summary: 'FLT-25: my flight bookings (group = upcoming / past / cancelled)',
  })
  list(@CurrentUser() user: AuthUser, @Query() q: ListFlightBookingsQueryDto) {
    return this.service.listMine(user, q);
  }

  @Get(':id/e-ticket')
  @Auth(Role.User, Role.Admin, Role.AirlineModerator)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'FLT-23: download the PDF e-ticket (confirmed bookings only)',
  })
  @ApiConflictResponse({ description: 'Booking is not confirmed' })
  async eTicketPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const booking = await this.service.eTicketBooking(user, id);
    const pdf = await this.eTicket.build(booking);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="e-ticket-${booking.bookingReference}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  @Get(':id/cancellation-quote')
  @Auth(Role.User)
  @ApiOperation({
    summary: 'FLT-26: see the refund you would get before cancelling',
  })
  quote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancellationQuote(user, id);
  }

  @Get(':id')
  @Auth(Role.User, Role.Admin, Role.AirlineModerator)
  @ApiOperation({
    summary:
      "FLT-25 / ACC-11: booking details. The owner gets everything, including refundAmount, refundStatus (PENDING, REFUNDED, FAILED) and refundId after a cancellation. An admin or that airline's moderator gets a reduced view: reference, status, seats, flights with cabin, and passenger names, types and ticket numbers only.",
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.viewFor(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth(Role.User)
  @ApiOperation({
    summary:
      'FLT-26 / PAY-03: cancel a confirmed booking before departure. The tier-based refund is recorded with refundStatus PENDING until the payment module confirms it.',
  })
  @ApiConflictResponse({ description: 'Not confirmed, or already departed' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }

  /**
   * TEMPORARY, for testing until Youssef's Stripe webhook exists.
   * Simulates a successful payment. DELETE before the final submission.
   */
  @Post(':id/dev-confirm')
  @HttpCode(200)
  @Auth(Role.Admin)
  @ApiOperation({
    summary:
      'DEV ONLY: simulate a successful payment (remove when payments are ready)',
  })
  devConfirm(@Param('id') id: string) {
    return this.service.confirmAfterPayment(
      id,
      `dev_${new Types.ObjectId().toString()}`,
    );
  }
}
