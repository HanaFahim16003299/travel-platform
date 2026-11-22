import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';
import { AuthorsController } from './authors.controller.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';
import { TagsController } from './tags.controller.js';
import { Comment, CommentSchema } from './schemas/comment.schema.js';
import { Like, LikeSchema } from './schemas/like.schema.js';
import { Post, PostSchema } from './schemas/post.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
    ]),
  ],
  controllers: [
    BlogController,
    CommentsController,
    LikesController,
    TagsController,
    AuthorsController,
  ],
  providers: [BlogService, CommentsService, LikesService],
})
export class BlogModule {}
