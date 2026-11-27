
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  })
  hotelId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'HotelBooking',
    required: true,
  })
  bookingId: Types.ObjectId;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be a whole number',
    },
  })
  rating: number;

  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  })
  comment: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ReviewSchema =
  SchemaFactory.createForClass(Review);

// Prevent multiple reviews for the same booking
ReviewSchema.index(
  { bookingId: 1 },
  { unique: true },
);

// Efficiently retrieve hotel reviews
ReviewSchema.index({
  hotelId: 1,
  createdAt: -1,
});

// Efficiently retrieve reviews belonging to a user
ReviewSchema.index({ userId: 1 });
