import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { BLOG_LIMITS } from '../blog.constants.js';
import { Post } from './post.schema.js';

export type CommentDocument = HydratedDocument<Comment>;

// BLG-05, BLG-07
@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: Post.name, required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: BLOG_LIMITS.commentLength })
  content: string;

  @Prop({ default: false, index: true })
  hidden: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ postId: 1, hidden: 1, createdAt: 1 });
