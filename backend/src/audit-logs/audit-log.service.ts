import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog } from './schemas/audit-log.schema.js';
import type { AuditLogDocument } from './schemas/audit-log.schema.js';

export interface AuditLogInput {
  actorId?: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly model: Model<AuditLogDocument>,
  ) {}

  log(input: AuditLogInput) {
    return this.model.create({
      actor: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
  }
}
