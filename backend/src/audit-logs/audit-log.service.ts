import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import { buildMeta } from '../common/utils/pagination.js';
import type { AuditLogsQueryDto } from './dto/audit-logs-query.dto.js';
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

  /** GEN-07: paginated, newest first. */
  async list(query: AuditLogsQueryDto) {
    const filter: QueryFilter<AuditLogDocument> = {};
    if (query.actorId) filter.actor = new Types.ObjectId(query.actorId);
    if (query.action) filter.action = query.action;
    if (query.targetType) filter.targetType = query.targetType;

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('"from" must not be later than "to"');
    }
    if (from || to) {
      filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    }

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('actor', 'email firstName lastName role')
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return { data, meta: buildMeta(total, query.page, query.limit) };
  }
}
