import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PROVIDER_SCOPE_KEY } from '../decorators.js';
import { Role } from '../../common/enums/index.js';

@Injectable()
export class ProviderScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.get(PROVIDER_SCOPE_KEY, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (user.role === Role.Admin) {
      if (cfg.allowAdmin) return true;
      throw new ForbiddenException('Only the assigned moderator can do this');
    }
    const a = user.assignedProvider;
    if (!a || a.type !== cfg.type || a.providerId !== req.params[cfg.param])
      throw new ForbiddenException('You can only manage your assigned provider');
    return true;
  }
}
