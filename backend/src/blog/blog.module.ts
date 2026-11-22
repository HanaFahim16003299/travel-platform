import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';
import { Post, PostSchema } from './schemas/post.schema.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }])],
  controllers: [BlogController],
  providers: [BlogService],
})
export class BlogModule {}
