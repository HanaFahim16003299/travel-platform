import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { AccountStatus } from '../../common/enums/index.js';

export const COOKIE_NAME = 'access_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, @InjectModel(User.name) private users: Model<User>) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new UnauthorizedException('Authentication required');

    let payload: { sub: string; tv: number };
    try {
      payload = await this.jwt.verifyAsync(token); // also enforces session expiry
    } catch {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Load from DB each request so suspension / logout / password change take effect immediately.
    const user = await this.users.findById(payload.sub).lean();
    if (!user || user.tokenVersion !== payload.tv) throw new UnauthorizedException('Session expired or invalid');
    if (user.status === AccountStatus.Suspended) throw new UnauthorizedException('Account suspended');
    if (user.status === AccountStatus.Deactivated) throw new UnauthorizedException('Account deactivated');

    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
      assignedProvider: user.assignedProvider
        ? { type: user.assignedProvider.type, providerId: String(user.assignedProvider.providerId) }
        : undefined,
    };
    return true;
  }
}
