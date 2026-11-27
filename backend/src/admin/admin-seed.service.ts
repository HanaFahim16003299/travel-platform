import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { AccountStatus, Role } from '../common/enums/index.js';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../common/password.js';
import { User } from '../users/schemas/user.schema.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

export type AdminSeedResult = 'created' | 'exists' | 'skipped';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ACC-18: administrator accounts are created at setup, never by self-registration.
 *
 * On every start, if ADMIN_EMAIL and ADMIN_PASSWORD are set in .env and no user
 * with that email exists, an active admin is created. An existing account is
 * never changed, so restarting the app cannot overwrite a password.
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(@InjectModel(User.name) private readonly users: Model<UserDocument>) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (error) {
      this.logger.error(`Admin seeding FAILED: ${(error as Error).message}`);
    }
  }

  async seed(): Promise<AdminSeedResult> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD are not set in .env, so no admin was seeded');
      return 'skipped';
    }
    if (!EMAIL_REGEX.test(email)) {
      this.logger.error('ADMIN_EMAIL is not a valid email address, so no admin was seeded');
      return 'skipped';
    }
    if (!PASSWORD_REGEX.test(password)) {
      this.logger.error(`ADMIN_PASSWORD does not meet the password rule (${PASSWORD_MESSAGE})`);
      return 'skipped';
    }

    const existing = await this.users.findOne({ email }).select('role').lean();
    if (existing) {
      if (existing.role !== Role.Admin) {
        this.logger.warn(`A user with ${email} already exists but is not an admin; left unchanged`);
      }
      return 'exists';
    }

    await this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      firstName: 'System',
      lastName: 'Admin',
      role: Role.Admin,
      status: AccountStatus.Active,
      mustChangePassword: false,
    });
    this.logger.log(`Admin account created for ${email}`);
    return 'created';
  }
}
