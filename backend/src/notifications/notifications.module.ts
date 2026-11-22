import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service.js';
import { Notification, NotificationSchema } from './schemas/notification.schema.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
