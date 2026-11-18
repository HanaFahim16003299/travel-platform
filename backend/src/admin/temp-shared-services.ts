import { Injectable } from '@nestjs/common';

// TEMPORARY: replace with Hana's real services when she pushes them.
@Injectable()
export class AuditLogService {
  async log(_entry: Record<string, unknown>): Promise<void> {}
}

@Injectable()
export class NotificationService {
  async create(_entry: Record<string, unknown>): Promise<void> {}
}
