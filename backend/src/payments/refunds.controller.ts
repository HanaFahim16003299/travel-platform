import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { RefundsService } from './refunds.service.js';

@ApiTags('Refunds')
@Auth()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'PAY-03 Inspect refund status' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.refundsService.getRefund(user, id);
  }
}
