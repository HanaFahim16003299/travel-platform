import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { BLOG_LIMITS, DEFAULT_POST_STATUS, PostStatus } from '../blog.constants.js';

export type PostDocument = HydratedDocument<Post>;

// BLG-01, BLG-02, BLG-03, BLG-08
@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, trim: true, maxlength: BLOG_LIMITS.titleLength })
  title: string;

  @Prop({ required: true, trim: true, maxlength: BLOG_LIMITS.bodyLength })
  body: string;

  @Prop({ type: [{ type: String, trim: true, lowercase: true }], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: String, enum: PostStatus, default: DEFAULT_POST_STATUS, index: true })
  status: PostStatus;

  @Prop({ default: false, index: true })
  hidden: boolean;

  @Prop({ default: 0, min: 0 })
  likeCount: number;

  @Prop({ default: 0, min: 0 })
  commentCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ status: 1, hidden: 1, createdAt: -1 });
PostSchema.index({ tags: 1 });
