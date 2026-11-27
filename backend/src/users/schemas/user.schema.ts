import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AccountStatus, ProviderType, Role } from '../../common/enums/index.js';

@Schema({ _id: false })
class AssignedProvider {
  @Prop({ enum: ProviderType, required: true }) type: ProviderType;
  @Prop({ type: Types.ObjectId, required: true }) providerId: Types.ObjectId;
}

@Schema({ _id: false })
class Preferences {
  @Prop({ default: 'USD' }) currency: string; // must be a code from the countries dataset
  @Prop({ default: 'en' }) language: string;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ required: true, trim: true }) firstName: string;
  @Prop({ required: true, trim: true }) lastName: string;
  @Prop({ trim: true }) phone?: string;

  @Prop({ type: Preferences, default: () => ({}) }) preferences: Preferences;

  @Prop({ enum: Role, default: Role.User, index: true }) role: Role;
  @Prop({ enum: AccountStatus, default: AccountStatus.Active, index: true })
  status: AccountStatus;

  // Moderator Assignment: exactly one provider
  @Prop({ type: AssignedProvider }) assignedProvider?: AssignedProvider;

  @Prop({ default: 0 }) failedLoginAttempts: number;
  @Prop() lockUntil?: Date;
  @Prop({ default: 0 }) tokenVersion: number; // bump to invalidate all sessions
  @Prop({ default: false }) mustChangePassword: boolean;
  @Prop() lastLoginAt?: Date;
  @Prop() deactivatedAt?: Date;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
