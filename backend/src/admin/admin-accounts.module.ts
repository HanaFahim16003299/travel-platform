import { Module } from '@nestjs/common';
import { AdminAccountsController } from './admin-accounts.controller.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AuditLogService, NotificationService } from './temp-shared-services.js';

@Module({
  controllers: [AdminAccountsController],
  providers: [AdminAccountsService, AuditLogService, NotificationService],
})
export class AdminAccountsModule {}
