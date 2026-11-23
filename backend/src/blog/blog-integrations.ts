import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { Role } from '../common/enums/index.js';
import type { AuditLogInput } from '../audit-logs/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateNotificationInput } from '../notifications/notifications.service.js';
import { ReportTargetType } from './blog.constants.js';

export interface BlogAuditEntry extends AuditLogInput {
  actorId: string;
  actorRole: Role;
  targetType: ReportTargetType;
  targetId: string;
}

export interface BlogNotification extends CreateNotificationInput {
  referenceType: ReportTargetType;
  referenceId: string;
}

@Injectable()
export class BlogIntegrations {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  logAudit(entry: BlogAuditEntry) {
    return this.auditLog.log(entry);
  }

  notifyAuthor(notification: BlogNotification) {
    return this.notifications.create(notification);
  }
}
