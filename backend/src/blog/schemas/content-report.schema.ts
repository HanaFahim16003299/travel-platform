import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { BLOG_LIMITS, ReportStatus, ReportTargetType } from '../blog.constants.js';

export type ContentReportDocument = HydratedDocument<ContentReport>;

// GEN-07, GEN-09, GEN-10
@Schema({ timestamps: true })
export class ContentReport {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  reporter: Types.ObjectId;

  @Prop({ type: String, enum: ReportTargetType, required: true })
  targetType: ReportTargetType;

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: BLOG_LIMITS.reportReasonLength })
  reason: string;

  @Prop({ type: String, enum: ReportStatus, default: ReportStatus.Pending, index: true })
  status: ReportStatus;

  @Prop({ type: Types.ObjectId, ref: User.name })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ trim: true, maxlength: BLOG_LIMITS.adminNoteLength })
  adminNote?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ContentReportSchema = SchemaFactory.createForClass(ContentReport);

ContentReportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
ContentReportSchema.index({ status: 1, targetType: 1, createdAt: -1 });
