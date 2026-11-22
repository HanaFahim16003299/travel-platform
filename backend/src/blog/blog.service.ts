import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { User } from '../users/schemas/user.schema.js';
import { BLOG_LIMITS, DEFAULT_POST_STATUS, PostStatus } from './blog.constants.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { Post, PostDocument } from './schemas/post.schema.js';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  // BLG-01, BLG-08
  create(userId: string, dto: CreatePostDto) {
    return this.posts.create({
      authorId: new Types.ObjectId(userId),
      title: dto.title,
      body: dto.body,
      tags: dto.tags ?? [],
      status: dto.status ?? DEFAULT_POST_STATUS,
    });
  }

  // BLG-02, BLG-08, BLG-09
  async findPublished(query: ListPostsQueryDto) {
    const filter: Record<string, unknown> = {
      status: PostStatus.Published,
      hidden: false,
    };
    if (query.tag) filter.tags = query.tag;

    if (query.keyword) {
      const regex = new RegExp(escapeRegex(query.keyword), 'i');
      const authorIds = await this.users.distinct('_id', {
        $or: [
          { firstName: regex },
          { lastName: regex },
          {
            $expr: {
              $regexMatch: {
                input: {
                  $concat: [
                    { $ifNull: ['$firstName', ''] },
                    ' ',
                    { $ifNull: ['$lastName', ''] },
                  ],
                },
                regex: escapeRegex(query.keyword),
                options: 'i',
              },
            },
          },
        ],
      });
      filter.$or = [
        { title: regex },
        { tags: regex },
        ...(authorIds.length > 0 ? [{ authorId: { $in: authorIds } }] : []),
      ];
    }

    return this.findPublishedPosts(filter, query);
  }

  // BLG-12
  async findAuthorPage(id: string, query: ListPostsQueryDto) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid author id');
    const authorId = new Types.ObjectId(id);
    const author = await this.users
      .findById(authorId)
      .select('firstName lastName createdAt')
      .lean<{
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
        createdAt: Date;
      }>()
      .exec();
    if (!author) throw new NotFoundException('Author not found');

    const posts = await this.findPublishedPosts(
      { authorId, status: PostStatus.Published, hidden: false },
      query,
    );
    return {
      author: {
        id: String(author._id),
        firstName: author.firstName,
        lastName: author.lastName,
        joinedAt: author.createdAt,
      },
      posts,
    };
  }

  private async findPublishedPosts(
    filter: Record<string, unknown>,
    query: ListPostsQueryDto,
  ) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.posts
        .aggregate([
          { $match: filter },
          {
            $addFields: {
              interactionScore: {
                $add: [
                  { $ifNull: ['$likeCount', 0] },
                  { $ifNull: ['$commentCount', 0] },
                ],
              },
            },
          },
          { $sort: { interactionScore: -1, createdAt: -1 } },
          { $skip: skip },
          { $limit: query.limit },
          {
            $lookup: {
              from: this.users.collection.name,
              localField: 'authorId',
              foreignField: '_id',
              as: 'author',
            },
          },
          { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              title: 1,
              author: {
                id: { $toString: '$author._id' },
                firstName: '$author.firstName',
                lastName: '$author.lastName',
              },
              createdAt: 1,
              likeCount: 1,
              commentCount: 1,
              excerpt: { $substrCP: ['$body', 0, BLOG_LIMITS.excerptLength] },
            },
          },
        ])
        .exec(),
      this.posts.countDocuments(filter),
    ]);

    return { items, ...paginationMeta(total, query.page, query.limit) };
  }

  // BLG-03
  async findMine(userId: string, query: ListPostsQueryDto) {
    const filter = { authorId: new Types.ObjectId(userId) };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.posts
        .find(filter)
        .select('title status createdAt likeCount commentCount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.posts.countDocuments(filter),
    ]);
    return { items, ...paginationMeta(total, query.page, query.limit) };
  }

  // BLG-02
  async findOne(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post id');
    const post = await this.posts
      .findOne({ _id: id, status: PostStatus.Published, hidden: false })
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Post not found');

    const author = await this.users
      .findById(post.authorId)
      .select('firstName lastName')
      .lean()
      .exec();
    return {
      _id: post._id,
      title: post.title,
      body: post.body,
      tags: post.tags,
      images: post.images,
      authorId: post.authorId,
      status: post.status,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: author
        ? { id: String(author._id), firstName: author.firstName, lastName: author.lastName }
        : null,
    };
  }

  // BLG-04, BLG-08
  async update(userId: string, id: string, dto: UpdatePostDto) {
    const post = await this.findOwnedPost(userId, id);
    if (dto.title !== undefined) post.title = dto.title;
    if (dto.body !== undefined) post.body = dto.body;
    if (dto.tags !== undefined) post.tags = dto.tags;
    if (dto.status !== undefined) post.status = dto.status;
    await post.save();
    return post;
  }

  // BLG-04
  async remove(userId: string, id: string) {
    const post = await this.findOwnedPost(userId, id);
    await post.deleteOne();
    return { message: 'Post deleted' };
  }

  private async findOwnedPost(userId: string, id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post id');
    const post = await this.posts.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    if (String(post.authorId) !== userId)
      throw new ForbiddenException('You can only manage your own posts');
    return post;
  }
}
