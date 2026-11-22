import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogService } from './audit-log.service.js';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogsModule {}
