import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema.js';
import { COOKIE_NAME, JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  constructor(
    jwt: JwtService,
    @InjectModel(User.name) users: Model<User>,
  ) {
    super(jwt, users);
  }

  async canActivate(ctx: import('@nestjs/common').ExecutionContext): Promise<boolean> {
    const request = ctx
      .switchToHttp()
      .getRequest<{ cookies?: Record<string, string | undefined> }>();
    if (!request.cookies?.[COOKIE_NAME]) return true;
    return super.canActivate(ctx);
  }
}
