import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { AuditLogService } from './audit-log.service.js';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto.js';

@ApiTags('Audit logs')
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @Get()
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'GEN-07 List admin actions, newest first (filter by actor, action, type, date)' })
  list(@Query() query: AuditLogsQueryDto) {
    return this.auditLogs.list(query);
  }
}
