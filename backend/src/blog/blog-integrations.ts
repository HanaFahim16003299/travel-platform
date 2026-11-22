import { Injectable } from '@nestjs/common';
import { AuditLogService, NotificationService } from '../admin/temp-shared-services.js';
import { Role } from '../common/enums/index.js';
import { ReportTargetType } from './blog.constants.js';

export interface BlogAuditEntry {
  actorId: string;
  actorRole: Role;
  action: string;
  targetType: ReportTargetType;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface BlogNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceType?: ReportTargetType;
  referenceId?: string;
}

@Injectable()
export class BlogIntegrations {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationService,
  ) {}

  logAudit(entry: BlogAuditEntry): Promise<void> {
    return this.auditLog.log({
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    });
  }

  notifyAuthor(notification: BlogNotification): Promise<void> {
    return this.notifications.create({
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      ...(notification.referenceType
        ? { referenceType: notification.referenceType }
        : {}),
      ...(notification.referenceId ? { referenceId: notification.referenceId } : {}),
    });
  }
}
