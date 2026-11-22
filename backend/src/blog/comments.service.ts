import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { User } from '../users/schemas/user.schema.js';
import { Post, PostDocument } from './schemas/post.schema.js';
import { Comment, CommentDocument } from './schemas/comment.schema.js';
import { PostStatus } from './blog.constants.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';

function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  // BLG-05
  async create(userId: string, postId: string, dto: CreateCommentDto) {
    const postObjectId = this.validateId(postId, 'post');
    await this.findPublicPost(postObjectId);

    const comment = await this.comments.create({
      postId: postObjectId,
      authorId: new Types.ObjectId(userId),
      content: dto.content,
    });
    const result = await this.posts.updateOne(
      { _id: postObjectId, status: PostStatus.Published, hidden: false },
      { $inc: { commentCount: 1 } },
    );
    if (result.matchedCount === 0) {
      await comment.deleteOne();
      throw new NotFoundException('Post not found');
    }
    return comment;
  }

  // BLG-05
  async findForPost(postId: string, query: ListCommentsQueryDto) {
    const postObjectId = this.validateId(postId, 'post');
    await this.findPublicPost(postObjectId);

    const filter = { postId: postObjectId, hidden: false };
    const skip = (query.page - 1) * query.limit;
    const [comments, total] = await Promise.all([
      this.comments
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.comments.countDocuments(filter),
    ]);

    const authorIds = [...new Set(comments.map((comment) => String(comment.authorId)))];
    const authors = await this.users
      .find({ _id: { $in: authorIds } })
      .select('firstName lastName')
      .lean()
      .exec();
    const authorsById = new Map(authors.map((author) => [String(author._id), author]));

    const items = comments.map((comment) => {
      const author = authorsById.get(String(comment.authorId));
      return {
        _id: comment._id,
        content: comment.content,
        author: author
          ? { id: String(author._id), firstName: author.firstName, lastName: author.lastName }
          : null,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    });
    return { items, ...paginationMeta(total, query.page, query.limit) };
  }

  // BLG-07
  async update(userId: string, id: string, dto: UpdateCommentDto) {
    const comment = await this.findOwnedComment(userId, id);
    comment.content = dto.content;
    await comment.save();
    return comment;
  }

  // BLG-07
  async remove(userId: string, id: string) {
    const comment = await this.findOwnedComment(userId, id);
    const result = await comment.deleteOne();
    if (result.deletedCount === 0) throw new NotFoundException('Comment not found');

    await this.posts.updateOne(
      { _id: comment.postId, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } },
    );
    return { message: 'Comment deleted' };
  }

  private async findPublicPost(postId: Types.ObjectId) {
    const post = await this.posts
      .findOne({ _id: postId, status: PostStatus.Published, hidden: false })
      .select('_id')
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async findOwnedComment(userId: string, id: string) {
    const commentId = this.validateId(id, 'comment');
    const comment = await this.comments.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (String(comment.authorId) !== userId)
      throw new ForbiddenException('You can only manage your own comments');
    return comment;
  }

  private validateId(id: string, resource: string) {
    if (!isValidObjectId(id)) throw new BadRequestException(`Invalid ${resource} id`);
    return new Types.ObjectId(id);
  }
}
