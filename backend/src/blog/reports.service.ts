import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Role } from '../common/enums/index.js';
import { BlogIntegrations } from './blog-integrations.js';
import {
  PostStatus,
  ReportAction,
  ReportStatus,
  ReportTargetType,
} from './blog.constants.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ListReportsQueryDto } from './dto/list-reports-query.dto.js';
import { ReviewReportDto } from './dto/review-report.dto.js';
import { deletePostImages } from './image-files.js';
import { Comment, CommentDocument } from './schemas/comment.schema.js';
import { ContentReport, ContentReportDocument } from './schemas/content-report.schema.js';
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

function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(ContentReport.name)
    private readonly reports: Model<ContentReportDocument>,
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
    @InjectModel(Like.name) private readonly likes: Model<LikeDocument>,
    private readonly integrations: BlogIntegrations,
  ) {}

  // GEN-09
  async submit(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    dto: CreateReportDto,
  ) {
    const targetObjectId = this.validateId(targetId, 'content');
    await this.ensureReportable(targetType, targetObjectId);

    try {
      return await this.reports.create({
        reporter: new Types.ObjectId(reporterId),
        targetType,
        targetId: targetObjectId,
        reason: dto.reason,
      });
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new ConflictException('You have already reported this content');
      throw error;
    }
  }

  // GEN-10
  async list(query: ListReportsQueryDto) {
    const filter: Record<string, unknown> = {
      status: query.status ?? ReportStatus.Pending,
    };
    if (query.targetType) filter.targetType = query.targetType;
    const skip = (query.page - 1) * query.limit;
    const [reports, total] = await Promise.all([
      this.reports
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.reports.countDocuments(filter),
    ]);

    const items = await Promise.all(
      reports.map(async (report) => {
        const target = await this.findTargetForReview(report.targetType, report.targetId);
        return {
          _id: report._id,
          reporter: report.reporter,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          status: report.status,
          reviewedBy: report.reviewedBy,
          reviewedAt: report.reviewedAt,
          adminNote: report.adminNote,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          target,
        };
      }),
    );
    return { items, ...paginationMeta(total, query.page, query.limit) };
  }

  // GEN-07, GEN-10
  async review(adminId: string, id: string, dto: ReviewReportDto) {
    const reportId = this.validateId(id, 'report');
    const report = await this.reports.findById(reportId);
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.Pending)
      throw new ConflictException('This report has already been reviewed');

    let authorId: string | undefined;
    let status: ReportStatus;
    if (dto.action === ReportAction.Dismiss) {
      status = ReportStatus.Dismissed;
    } else if (dto.action === ReportAction.Hide) {
      authorId = await this.setHidden(report.targetType, report.targetId);
      status = ReportStatus.ContentHidden;
    } else {
      authorId = await this.deleteTarget(report.targetType, report.targetId);
      status = ReportStatus.ContentDeleted;
    }

    const reviewedAt = new Date();
    const update: Record<string, unknown> = {
      status,
      reviewedBy: new Types.ObjectId(adminId),
      reviewedAt,
    };
    if (dto.adminNote !== undefined) update.adminNote = dto.adminNote;

    const reviewed = await this.reports.findOneAndUpdate(
      { _id: reportId, status: ReportStatus.Pending },
      { $set: update },
      { new: true },
    );
    if (!reviewed)
      throw new ConflictException('This report has already been reviewed');

    const action = this.auditAction(dto.action);
    await this.integrations.logAudit({
      actorId: adminId,
      actorRole: Role.Admin,
      action,
      targetType: report.targetType,
      targetId: String(report.targetId),
      metadata: {
        timestamp: reviewedAt,
        reportId: String(report._id),
        adminNote: dto.adminNote,
      },
    });
    if (authorId && dto.action !== ReportAction.Dismiss)
      await this.notifyAuthor(
        authorId,
        dto.action,
        report.targetType,
        String(report.targetId),
      );

    return reviewed;
  }

  // GEN-07, GEN-10
  async deleteContent(adminId: string, targetType: ReportTargetType, id: string) {
    const targetId = this.validateId(id, 'content');
    const authorId = await this.deleteTarget(targetType, targetId);
    const timestamp = new Date();
    await this.integrations.logAudit({
      actorId: adminId,
      actorRole: Role.Admin,
      action: 'CONTENT_DELETED',
      targetType,
      targetId: String(targetId),
      metadata: { timestamp, source: 'direct_admin_action' },
    });
    await this.notifyAuthor(authorId, ReportAction.Delete, targetType, String(targetId));
    return { message: 'Content deleted' };
  }

  private async ensureReportable(targetType: ReportTargetType, targetId: Types.ObjectId) {
    if (targetType === ReportTargetType.Post) {
      const post = await this.posts
        .findOne({ _id: targetId, status: PostStatus.Published, hidden: false })
        .select('_id')
        .lean()
        .exec();
      if (!post) throw new NotFoundException('Post not found');
      return;
    }

    const comment = await this.comments
      .findOne({ _id: targetId, hidden: false })
      .select('postId')
      .lean()
      .exec();
    if (!comment) throw new NotFoundException('Comment not found');
    const post = await this.posts
      .findOne({
        _id: comment.postId,
        status: PostStatus.Published,
        hidden: false,
      })
      .select('_id')
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Comment not found');
  }

  private async findTargetForReview(targetType: ReportTargetType, targetId: Types.ObjectId) {
    if (targetType === ReportTargetType.Post) {
      const post = await this.posts
        .findById(targetId)
        .select('title body authorId status hidden createdAt')
        .lean()
        .exec();
      return post
        ? {
            id: String(post._id),
            type: targetType,
            title: post.title,
            body: post.body,
            authorId: String(post.authorId),
            status: post.status,
            hidden: post.hidden,
            createdAt: post.createdAt,
          }
        : null;
    }

    const comment = await this.comments
      .findById(targetId)
      .select('content authorId postId hidden createdAt')
      .lean()
      .exec();
    return comment
      ? {
          id: String(comment._id),
          type: targetType,
          content: comment.content,
          authorId: String(comment.authorId),
          postId: String(comment.postId),
          hidden: comment.hidden,
          createdAt: comment.createdAt,
        }
      : null;
  }

  private async setHidden(targetType: ReportTargetType, targetId: Types.ObjectId) {
    const target =
      targetType === ReportTargetType.Post
        ? await this.posts
            .findByIdAndUpdate(targetId, { $set: { hidden: true } }, { new: true })
            .select('authorId')
        : await this.comments
            .findByIdAndUpdate(targetId, { $set: { hidden: true } }, { new: true })
            .select('authorId');
    if (!target) throw new NotFoundException('Content not found');
    return String(target.authorId);
  }

  private async deleteTarget(targetType: ReportTargetType, targetId: Types.ObjectId) {
    if (targetType === ReportTargetType.Post) {
      const post = await this.posts.findById(targetId).select('authorId images');
      if (!post) throw new NotFoundException('Post not found');
      const images = post.images ?? [];
      await post.deleteOne();
      await Promise.all([
        this.comments.deleteMany({ postId: targetId }),
        this.likes.deleteMany({ postId: targetId }),
        deletePostImages(images),
      ]);
      return String(post.authorId);
    }

    const comment = await this.comments.findById(targetId);
    if (!comment) throw new NotFoundException('Comment not found');
    const postId = comment.postId;
    const authorId = String(comment.authorId);
    await comment.deleteOne();
    await this.posts.updateOne(
      { _id: postId, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } },
    );
    return authorId;
  }

  private async notifyAuthor(
    authorId: string,
    action: ReportAction,
    targetType: ReportTargetType,
    targetId: string,
  ) {
    const hidden = action === ReportAction.Hide;
    await this.integrations.notifyAuthor({
      userId: authorId,
      type: hidden ? 'CONTENT_HIDDEN' : 'CONTENT_DELETED',
      title: hidden ? 'Content hidden' : 'Content deleted',
      message: `Your ${targetType} was ${hidden ? 'hidden' : 'deleted'} by an administrator.`,
      referenceType: targetType,
      referenceId: targetId,
    });
  }

  private auditAction(action: ReportAction) {
    switch (action) {
      case ReportAction.Dismiss:
        return 'CONTENT_REPORT_DISMISSED';
      case ReportAction.Hide:
        return 'CONTENT_HIDDEN';
      case ReportAction.Delete:
        return 'CONTENT_DELETED';
    }
  }

  private validateId(id: string, resource: string) {
    if (!isValidObjectId(id)) throw new BadRequestException(`Invalid ${resource} id`);
    return new Types.ObjectId(id);
  }
}
