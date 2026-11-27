import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Role, ProviderType } from '../common/enums/index.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { ProviderScopeGuard } from './guards/provider-scope.guard.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  assignedProvider?: { type: ProviderType; providerId: string };
}

export const ROLES_KEY = 'roles';
export const PROVIDER_SCOPE_KEY = 'provider_scope';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** Require login, and optionally one of the given roles. Usage: @Auth()  or  @Auth(Role.Admin) */
export const Auth = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiCookieAuth(),
    ApiUnauthorizedResponse({ description: 'Not logged in' }),
    ApiForbiddenResponse({ description: 'Role not allowed' }),
  );

/**
 * For moderator routes like PATCH /airlines/:id : the moderator may only touch
 * the provider assigned to them. `param` = route param holding the provider id.
 * Usage: @Auth(Role.AirlineModerator) @ProviderScope(ProviderType.Airline)
 */
export const ProviderScope = (type: ProviderType, param = 'id', allowAdmin = false) =>
  applyDecorators(
    SetMetadata(PROVIDER_SCOPE_KEY, { type, param, allowAdmin }),
    UseGuards(ProviderScopeGuard),
  );
