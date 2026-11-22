import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  actor?: Types.ObjectId;

  @Prop({ type: String })
  actorRole?: string;

  @Prop({ type: String, required: true, index: true })
  action: string;

  @Prop({ type: String, required: true })
  targetType: string;

  @Prop({ type: String })
  targetId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
