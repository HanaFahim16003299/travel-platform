import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { AccountStatus, Role } from '../common/enums/index.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto.js';

// ACC-05: CHECK the Excel sheet for the exact numbers.
const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_LOGINS ?? 5);
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES ?? 15);
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10); // equalises timing for unknown emails

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService, @InjectModel(User.name) private users: Model<UserDocument>) {}

  sanitize(u: any) {
    const o = u.toObject ? u.toObject() : { ...u };
    delete o.passwordHash; delete o.failedLoginAttempts; delete o.lockUntil; delete o.tokenVersion; delete o.__v;
    return o;
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');
    const user = await this.users.create({
      email, firstName: dto.firstName, lastName: dto.lastName,
      passwordHash: await bcrypt.hash(dto.password, 12),
      role: Role.User, // role is never taken from the request body
    });
    return this.sanitize(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ email: dto.email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(`Account temporarily locked. Try again in ${mins} minute(s)`);
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status === AccountStatus.Suspended) throw new ForbiddenException('Account suspended. Contact an administrator');
    if (user.status === AccountStatus.Deactivated) throw new ForbiddenException('Account deactivated');

    user.failedLoginAttempts = 0; user.lockUntil = undefined; user.lastLoginAt = new Date();
    await user.save();
    return { token: this.sign(user), user: this.sanitize(user) };
  }

  sign(user: UserDocument) {
    return this.jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion });
  }

  async logout(userId: string) {
    await this.users.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }); // server-side invalidation
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findById(userId).select('+passwordHash');
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('New password must differ from the current one');
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.tokenVersion += 1;           // log out other sessions
    user.mustChangePassword = false;
    await user.save();
    return this.sign(user);           // keep this session alive with a fresh token
  }
}
