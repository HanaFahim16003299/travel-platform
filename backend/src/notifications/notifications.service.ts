import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { buildMeta } from '../common/utils/pagination.js';
import { Notification } from './schemas/notification.schema.js';
import type { NotificationDocument } from './schemas/notification.schema.js';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly model: Model<NotificationDocument>,
  ) {}

  private toDoc(i: CreateNotificationInput) {
    return {
      user: new Types.ObjectId(i.userId),
      type: i.type,
      title: i.title,
      message: i.message,
      referenceType: i.referenceType,
      referenceId: i.referenceId,
    };
  }

  create(input: CreateNotificationInput) {
    return this.model.create(this.toDoc(input));
  }

  async createMany(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return [];
    return this.model.insertMany(inputs.map((i) => this.toDoc(i)));
  }

  async listForUser(userId: string, page = 1, limit = 10, unreadOnly = false) {
    const filter: Record<string, unknown> = { user: new Types.ObjectId(userId) };
    if (unreadOnly) filter.read = false;
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return { data, meta: buildMeta(total, page, limit) };
  }

  unreadCount(userId: string) {
    return this.model.countDocuments({ user: new Types.ObjectId(userId), read: false });
  }

  async markRead(userId: string, id: string) {
    const found = await this.model.findOneAndUpdate(
      { _id: id, user: new Types.ObjectId(userId) },
      { read: true },
      { new: true },
    );
    if (!found) throw new NotFoundException('Notification not found');
    return found;
  }

  async markAllRead(userId: string) {
    const res = await this.model.updateMany(
      { user: new Types.ObjectId(userId), read: false },
      { read: true },
    );
    return { updated: res.modifiedCount };
  }
}
