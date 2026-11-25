import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Refunds')
@Auth()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'PAY-03 Inspect refund status' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getRefund(user, id);
  }
}
