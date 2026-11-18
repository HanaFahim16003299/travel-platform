import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from './enums/index.js';

/** Use inside services: assertOwner(booking.userId, user). Admins pass only if allowAdmin. */
export function assertOwner(ownerId: unknown, user: AuthUser, allowAdmin = false) {
  if (String(ownerId) === user.id) return;
  if (allowAdmin && user.role === Role.Admin) return;
  throw new ForbiddenException('You do not have access to this resource');
}
