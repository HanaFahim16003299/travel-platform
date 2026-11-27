import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { NotificationIdParamDto, NotificationsQueryDto } from './dto/notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';

/** GEN-01: the logged-in user's own in-app notifications. */
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'GEN-01 List my notifications, newest first, with the unread count' })
  async list(@CurrentUser() user: AuthUser, @Query() query: NotificationsQueryDto) {
    const [page, unreadCount] = await Promise.all([
      this.notifications.listForUser(user.id, query.page, query.limit, query.unread),
      this.notifications.unreadCount(user.id),
    ]);
    return { ...page, unreadCount };
  }

  @Get('unread-count')
  @Auth()
  @ApiOperation({ summary: 'GEN-01 Number of unread notifications' })
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { unreadCount: await this.notifications.unreadCount(user.id) };
  }

  @Patch('read-all')
  @Auth()
  @ApiOperation({ summary: 'GEN-01 Mark all my notifications as read' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @Auth()
  @ApiOperation({ summary: 'GEN-01 Mark one of my notifications as read' })
  @ApiNotFoundResponse({ description: 'Not found, or it belongs to another user' })
  read(@CurrentUser() user: AuthUser, @Param() { id }: NotificationIdParamDto) {
    return this.notifications.markRead(user.id, id);
  }
}
