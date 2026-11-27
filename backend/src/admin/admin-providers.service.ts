import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Airline } from '../airlines/schemas/airline.schema.js';
import { Hotel } from '../hotels/schemas/hotel.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { ProviderType } from '../common/enums/index.js';
import { buildMeta } from '../common/utils/pagination.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ListProvidersQuery } from './dto/admin.dto.js';

@Injectable()
export class AdminProvidersService {
  constructor(
    @InjectModel(Airline.name) private airlines: Model<any>,
    @InjectModel(Hotel.name) private hotels: Model<any>,
    @InjectModel(User.name) private users: Model<any>,
    private audit: AuditLogService,
    private notifications: NotificationsService,
  ) {}

  private model(type: ProviderType): Model<any> {
    return type === ProviderType.Airline ? this.airlines : this.hotels;
  }

  /** GET /airlines (public, active only) and GET /admin/providers/:type (admin, all). */
  async list(type: ProviderType, q: ListProvidersQuery, includeInactive: boolean) {
    const filter: Record<string, any> = {};
    if (!includeInactive) filter.isActive = true;
    if (q.search) filter.name = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const fields = type === ProviderType.Airline
      ? 'name code country logo isActive'
      : 'name cityId address starRating isActive';
    const [data, total] = await Promise.all([
      this.model(type).find(filter).select(fields).sort({ name: 1 })
        .skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      this.model(type).countDocuments(filter),
    ]);
    return { data, meta: buildMeta(total, q.page, q.limit) };
  }

  /**
   * ACC-15: deactivated providers are hidden from search and cannot be booked.
   * Existing bookings are NOT touched, so confirmed bookings stay valid.
   */
  async setActive(adminId: string, type: ProviderType, id: string, active: boolean) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');
    const doc = await this.model(type).findById(id);
    if (!doc) throw new NotFoundException(`${type} not found`);
    if (doc.isActive === active) {
      throw new ConflictException(`This ${type} is already ${active ? 'active' : 'deactivated'}`);
    }
    doc.isActive = active;
    await doc.save();

    await this.audit.log({
      actorId: adminId,
      actorRole: 'admin',
      action: active ? 'PROVIDER_REACTIVATED' : 'PROVIDER_DEACTIVATED',
      targetType: type,
      targetId: id,
      metadata: { name: doc.name },
    });

    // Affected party: the moderator(s) assigned to this provider.
    const moderators = await this.users
      .find({ 'assignedProvider.type': type, 'assignedProvider.providerId': id })
      .select('_id').lean();
    await this.notifications.createMany(
      moderators.map((m: any) => ({
        userId: String(m._id),
        type: active ? 'PROVIDER_REACTIVATED' : 'PROVIDER_DEACTIVATED',
        title: active ? 'Provider reactivated' : 'Provider deactivated',
        message: active
          ? `${doc.name} is active again and visible in search.`
          : `${doc.name} was deactivated by an administrator. It is hidden from search and cannot be booked. Existing confirmed bookings stay valid.`,
        referenceType: type,
        referenceId: id,
      })),
    );

    return { id, type, name: doc.name, isActive: doc.isActive };
  }
}
