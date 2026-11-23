import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { UploadsService } from '../uploads/uploads.service.js';
import { MAX_IMAGE_SIZE_BYTES } from '../uploads/image-upload.options.js';
import { Model, Types, isValidObjectId } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { Role } from '../common/enums/index.js';
import type { AuthUser } from '../auth/decorators.js';
import { User } from '../users/schemas/user.schema.js';
import { BLOG_LIMITS, DEFAULT_POST_STATUS, PostStatus } from './blog.constants.js';
import { deletePostImages, deleteStoredImage } from './image-files.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { Post, PostDocument } from './schemas/post.schema.js';
import type { PostImage } from './schemas/post.schema.js';

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
    private readonly uploads: UploadsService,
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
        .select('title status hidden createdAt likeCount commentCount')
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
  async findOne(id: string, viewer?: AuthUser) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post id');
    const post = await this.posts
      .findById(id)
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Post not found');
    const isPublic = post.status === PostStatus.Published && !post.hidden;
    const isOwner = viewer?.id === String(post.authorId);
    const isAdmin = viewer?.role === Role.Admin;
    if (!isPublic && !isOwner && !isAdmin) throw new NotFoundException('Post not found');

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
      hidden: post.hidden,
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
    await deletePostImages(post.images ?? []);
    return { message: 'Post deleted' };
  }

  // BLG-10, GEN-08
  async addImage(userId: string, postId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');

    try {
      if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png')
        throw new BadRequestException('Only JPG and PNG images are allowed');
      if (file.size > MAX_IMAGE_SIZE_BYTES)
        throw new BadRequestException('Image must be 5 MB or smaller');

      const post = await this.findOwnedPost(userId, postId);
      if ((post.images?.length ?? 0) >= BLOG_LIMITS.imagesPerPost)
        throw new BadRequestException(
          `A post can have at most ${BLOG_LIMITS.imagesPerPost} images`,
        );

      const image: PostImage = {
        id: randomUUID(),
        url: this.uploads.publicUrl(file.filename),
        filename: file.filename,
      };
      const availableImageSlot = `images.${BLOG_LIMITS.imagesPerPost - 1}`;
      const updatedPost = await this.posts.findOneAndUpdate(
        {
          _id: post._id,
          authorId: post.authorId,
          [availableImageSlot]: { $exists: false },
        },
        { $push: { images: image } },
        { new: true, runValidators: true },
      );
      if (!updatedPost) {
        const currentPost = await this.posts.findById(post._id).select('authorId');
        if (!currentPost) throw new NotFoundException('Post not found');
        if (String(currentPost.authorId) !== userId)
          throw new ForbiddenException('You can only manage your own posts');
        throw new BadRequestException(
          `A post can have at most ${BLOG_LIMITS.imagesPerPost} images`,
        );
      }
      return updatedPost;
    } catch (error) {
      await deleteStoredImage(file.filename);
      throw error;
    }
  }

  // BLG-10, GEN-08
  async removeImage(userId: string, postId: string, imageId: string) {
    if (!isUUID(imageId))
      throw new BadRequestException('Invalid image id');
    const post = await this.findOwnedPost(userId, postId);
    const images = post.images ?? [];
    const image = images.find((item) => item.id === imageId);
    if (!image) throw new NotFoundException('Image not found');

    post.images = images.filter((item) => item.id !== imageId);
    await post.save();
    await deleteStoredImage(image.filename);
    return post;
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
