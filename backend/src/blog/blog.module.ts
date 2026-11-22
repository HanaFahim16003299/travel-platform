import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogService, NotificationService } from '../admin/temp-shared-services.js';
import { AdminModerationController } from './admin-moderation.controller.js';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';
import { AuthorsController } from './authors.controller.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';
import { BlogIntegrations } from './blog-integrations.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { TagsController } from './tags.controller.js';
import { Comment, CommentSchema } from './schemas/comment.schema.js';
import { ContentReport, ContentReportSchema } from './schemas/content-report.schema.js';
import { Like, LikeSchema } from './schemas/like.schema.js';
import { Post, PostSchema } from './schemas/post.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
      { name: ContentReport.name, schema: ContentReportSchema },
    ]),
  ],
  controllers: [
    AdminModerationController,
    BlogController,
    CommentsController,
    LikesController,
    ReportsController,
    TagsController,
    AuthorsController,
  ],
  providers: [
    BlogService,
    CommentsService,
    LikesService,
    ReportsService,
    BlogIntegrations,
    AuditLogService,
    NotificationService,
    OptionalJwtAuthGuard,
  ],
})
export class BlogModule {}
