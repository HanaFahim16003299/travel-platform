import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Auth()
  @ApiOperation({ summary: 'PAY-01 Create Stripe PaymentIntent for a booking' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(user, dto);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'PAY-01 Stripe webhook to verify payment outcomes' })
  @ApiHeader({ name: 'stripe-signature', required: true })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body for Stripe signature verification');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }

  @Post(':id/retry')
  @Auth()
  @ApiOperation({ summary: 'PAY-01 Retry a failed or pending payment' })
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.retryPayment(user, id);
  }

  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'PAY-01 Inspect payment status' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getPayment(user, id);
  }
}
