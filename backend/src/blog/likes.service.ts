import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { PostStatus } from './blog.constants.js';
import { Like, LikeDocument } from './schemas/like.schema.js';
import { Post, PostDocument } from './schemas/post.schema.js';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class LikesService {
  constructor(
    @InjectModel(Like.name) private readonly likes: Model<LikeDocument>,
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
  ) {}

  // BLG-06
  async like(userId: string, postId: string) {
    const postObjectId = this.validatePostId(postId);
    await this.findPublicPost(postObjectId);

    try {
      await this.likes.create({
        userId: new Types.ObjectId(userId),
        postId: postObjectId,
      });
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new ConflictException('You have already liked this post');
      throw error;
    }

    const post = await this.posts.findOneAndUpdate(
      { _id: postObjectId, status: PostStatus.Published, hidden: false },
      { $inc: { likeCount: 1 } },
      { new: true, select: 'likeCount' },
    );
    if (!post) {
      await this.likes.deleteOne({
        userId: new Types.ObjectId(userId),
        postId: postObjectId,
      });
      throw new NotFoundException('Post not found');
    }
    return { liked: true, likeCount: post.likeCount };
  }

  // BLG-06
  async unlike(userId: string, postId: string) {
    const postObjectId = this.validatePostId(postId);
    await this.findPublicPost(postObjectId);

    const like = await this.likes.findOneAndDelete({
      userId: new Types.ObjectId(userId),
      postId: postObjectId,
    });
    if (!like) throw new ConflictException('You have not liked this post');

    const post = await this.posts.findOneAndUpdate(
      { _id: postObjectId, likeCount: { $gt: 0 } },
      { $inc: { likeCount: -1 } },
      { new: true, select: 'likeCount' },
    );
    return { liked: false, likeCount: post?.likeCount ?? 0 };
  }

  private async findPublicPost(postId: Types.ObjectId) {
    const post = await this.posts
      .findOne({ _id: postId, status: PostStatus.Published, hidden: false })
      .select('_id')
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Post not found');
  }

  private validatePostId(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post id');
    return new Types.ObjectId(id);
  }
}
