import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { AccountStatus, ProviderType, Role } from '../common/enums/index.js';
import { CreateModeratorDto, ListAccountsQuery } from './dto/admin.dto.js';
// Hana's shared services - ADJUST import paths / method names to what she actually pushed:
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class AdminAccountsService {
  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    private audit: AuditLogService,
    private notifications: NotificationsService,
  ) {}

  private clean(u: any) {
    const o = u.toObject ? u.toObject() : { ...u };
    delete o.passwordHash; delete o.tokenVersion; delete o.failedLoginAttempts; delete o.__v;
    return o;
  }

  async createModerator(adminId: string, dto: CreateModeratorDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');
    if (await this.users.exists({ 'assignedProvider.providerId': dto.providerId, 'assignedProvider.type': dto.providerType }))
      throw new ConflictException('This provider already has a moderator');
    // TODO: verify the airline/hotel document exists once #3/#4 models are merged.
    const user = await this.users.create({
      email, firstName: dto.firstName, lastName: dto.lastName,
      passwordHash: await bcrypt.hash(dto.password, 12),
      role: dto.providerType === ProviderType.Airline ? Role.AirlineModerator : Role.HotelModerator,
      assignedProvider: { type: dto.providerType, providerId: dto.providerId },
    });
    await this.audit.log({ actorId: adminId, actorRole: 'admin', action: 'MODERATOR_CREATED', targetType: 'user', targetId: String(user._id),
      metadata: { providerType: dto.providerType, providerId: dto.providerId } });
    return this.clean(user);
  }

  async list(q: ListAccountsQuery) {
    const filter: Record<string, any> = {};
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
    }
    const [items, total] = await Promise.all([
      this.users.find(filter).select('-tokenVersion -failedLoginAttempts -__v')
        .sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      this.users.countDocuments(filter),
    ]);
    return { items, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) };
  }

  private async getTarget(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');
    const u = await this.users.findById(id);
    if (!u) throw new NotFoundException('Account not found');
    return u;
  }

  async suspend(adminId: string, id: string, reason?: string) {
    const u = await this.getTarget(id);
    if (u.role === Role.Admin) throw new ForbiddenException('Administrator accounts cannot be suspended');
    if (u.status === AccountStatus.Suspended) throw new ConflictException('Account already suspended');
    u.status = AccountStatus.Suspended;
    u.tokenVersion += 1; // kicks out active sessions immediately
    await u.save();
    await this.audit.log({ actorId: adminId, actorRole: 'admin', action: 'ACCOUNT_SUSPENDED', targetType: 'user', targetId: id, metadata: { reason } });
    await this.notifications.create({ userId: id, type: 'ACCOUNT_SUSPENDED', title: 'Account suspended', message: 'Your account has been suspended by an administrator.' });
    return this.clean(u);
  }

  async reactivate(adminId: string, id: string) {
    const u = await this.getTarget(id);
    if (u.status === AccountStatus.Active) throw new ConflictException('Account is already active');
    u.status = AccountStatus.Active; u.lockUntil = undefined; u.failedLoginAttempts = 0;
    await u.save();
    await this.audit.log({ actorId: adminId, actorRole: 'admin', action: 'ACCOUNT_REACTIVATED', targetType: 'user', targetId: id });
    await this.notifications.create({ userId: id, type: 'ACCOUNT_REACTIVATED', title: 'Account reactivated', message: 'Your account has been reactivated.' });
    return this.clean(u);
  }

  /** ACC-07a: admin sets a temporary password, shown once. User must change it at next login. */
  async resetPassword(adminId: string, id: string) {
    const u = await this.getTarget(id);
    if (u.role === Role.Admin && String(u._id) !== adminId) throw new ForbiddenException('Cannot reset another administrator');
    const temp = randomBytes(9).toString('base64url') + 'aA1'; // satisfies the password rule
    u.passwordHash = await bcrypt.hash(temp, 12);
    u.mustChangePassword = true; u.tokenVersion += 1; u.lockUntil = undefined; u.failedLoginAttempts = 0;
    await u.save();
    await this.audit.log({ actorId: adminId, actorRole: 'admin', action: 'PASSWORD_RESET_BY_ADMIN', targetType: 'user', targetId: id });
    await this.notifications.create({ userId: id, type: 'PASSWORD_RESET', title: 'Password reset', message: 'An administrator reset your password. Please change it after logging in.' });
    return { temporaryPassword: temp, note: 'Shown once. Share it securely; the user must change it at next login.' };
  }
}
