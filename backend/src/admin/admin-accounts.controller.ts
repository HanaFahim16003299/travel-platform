import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { CreateModeratorDto, ListAccountsQuery, SuspendDto } from './dto/admin.dto.js';

@ApiTags('Admin - Accounts')
@Auth(Role.Admin)
@Controller('admin')
export class AdminAccountsController {
  constructor(private svc: AdminAccountsService) {}

  @Post('moderators') @ApiOperation({ summary: 'ACC-13 Create moderator account' })
  create(@CurrentUser() a: AuthUser, @Body() dto: CreateModeratorDto) { return this.svc.createModerator(a.id, dto); }

  @Get('accounts') @ApiOperation({ summary: 'ACC-14 List accounts (filter, search, paginate)' })
  list(@Query() q: ListAccountsQuery) { return this.svc.list(q); }

  @Patch('accounts/:id/suspend') @ApiOperation({ summary: 'ACC-15/16 Suspend account' })
  suspend(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: SuspendDto) { return this.svc.suspend(a.id, id, dto.reason); }

  @Patch('accounts/:id/reactivate') @ApiOperation({ summary: 'ACC-15/16 Reactivate account' })
  reactivate(@CurrentUser() a: AuthUser, @Param('id') id: string) { return this.svc.reactivate(a.id, id); }

  @Post('users/:id/reset-password') @ApiOperation({ summary: 'ACC-07a Admin-assisted password reset' })
  reset(@CurrentUser() a: AuthUser, @Param('id') id: string) { return this.svc.resetPassword(a.id, id); }
}
