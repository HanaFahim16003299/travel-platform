import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

import { InjectModel, InjectConnection } from '@nestjs/mongoose';

import type { Model, Connection, ClientSession } from 'mongoose';

import { Review } from './schemas/review.schema.js';

import type { ReviewDocument } from './schemas/review.schema.js';

import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema.js';

import type { HotelBookingDocument } from '../hotel-bookings/schemas/hotel-booking.schema.js';

import { Hotel } from '../hotels/schemas/hotel.schema.js';

import type { HotelDocument } from '../hotels/schemas/hotel.schema.js';

import { BookingStatus } from '../hotel-bookings/enums/booking-status.enum.js';

import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';

import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';

import { buildMeta } from '../common/utils/pagination.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,

    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBookingDocument>,

    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<HotelDocument>,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // ==========================================
  // HTL-23: CREATE REVIEW
  // ==========================================

  async create(userId: string, bookingId: string, dto: CreateReviewDto) {
    const ownerId = this.validateId(userId, 'user');

    const validBookingId = this.validateId(bookingId, 'booking');

    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        // Find the booking
        const booking = await this.bookingModel
          .findById(validBookingId)
          .session(session);

        if (!booking) {
          throw new NotFoundException('Booking not found');
        }

        // Verify booking ownership
        if (String(booking.userId) !== ownerId) {
          throw new ForbiddenException('You can only review your own bookings');
        }

        // Confirmed or Completed bookings are eligible (HTL-23)
        if (
          booking.status !== BookingStatus.Confirmed &&
          booking.status !== BookingStatus.Completed
        ) {
          throw new BadRequestException(
            'Only confirmed bookings can receive reviews',
          );
        }

        // The stay must have ended
        if (booking.checkOut.getTime() > Date.now()) {
          throw new BadRequestException(
            'You can only review a hotel after completing your stay',
          );
        }

        // Check whether this booking already has a review
        const existingReview = await this.reviewModel
          .findOne({
            bookingId: booking._id,
          })
          .session(session);

        if (existingReview) {
          throw new ConflictException('This booking already has a review');
        }

        // Create review
        const review = new this.reviewModel({
          userId: ownerId,
          hotelId: booking.hotelId,
          bookingId: booking._id,
          rating: dto.rating,
          comment: dto.comment,
        });

        await review.save({ session });

        // Update the hotel's review statistics
        await this.updateHotelRating(String(booking.hotelId), session);

        return review;
      });
    } catch (error) {
      // Handle concurrent duplicate review requests
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('This booking already has a review');
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  // ==========================================
  // HTL-23: EDIT REVIEW
  // ==========================================

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const ownerId = this.validateId(userId, 'user');

    const validReviewId = this.validateId(reviewId, 'review');

    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('Provide a rating or comment to update');
    }

    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        const review = await this.reviewModel
          .findById(validReviewId)
          .session(session);

        if (!review) {
          throw new NotFoundException('Review not found');
        }

        // Verify review ownership
        if (String(review.userId) !== ownerId) {
          throw new ForbiddenException('You can only edit your own reviews');
        }

        // Update only supplied fields
        if (dto.rating !== undefined) {
          review.rating = dto.rating;
        }

        if (dto.comment !== undefined) {
          review.comment = dto.comment;
        }

        await review.save({ session });

        // Recalculate hotel rating
        await this.updateHotelRating(String(review.hotelId), session);

        return review;
      });
    } finally {
      await session.endSession();
    }
  }

  // ==========================================
  // HTL-23: DELETE REVIEW
  // ==========================================

  async remove(userId: string, reviewId: string) {
    const ownerId = this.validateId(userId, 'user');

    const validReviewId = this.validateId(reviewId, 'review');

    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        const review = await this.reviewModel
          .findById(validReviewId)
          .session(session);

        if (!review) {
          throw new NotFoundException('Review not found');
        }

        // Verify review ownership
        if (String(review.userId) !== ownerId) {
          throw new ForbiddenException('You can only delete your own reviews');
        }

        const hotelId = String(review.hotelId);

        // Delete review
        await this.reviewModel.deleteOne({ _id: review._id }, { session });

        // Recalculate hotel rating
        await this.updateHotelRating(hotelId, session);

        return {
          message: 'Review deleted successfully',
        };
      });
    } finally {
      await session.endSession();
    }
  }

  // ==========================================
  // HTL-24: LIST HOTEL REVIEWS
  // Public endpoint
  // ==========================================

  async findByHotel(hotelId: string, query: PaginationQueryDto) {
    const validHotelId = this.validateId(hotelId, 'hotel');

    const hotel = await this.hotelModel
      .findById(validHotelId)
      .select('averageRating reviewCount')
      .lean();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    const { page = 1, limit = 10, sort, order } = query;

    const allowedSortFields = ['createdAt', 'updatedAt', 'rating'];

    if (sort !== undefined && !allowedSortFields.includes(sort)) {
      throw new BadRequestException('Invalid sorting field');
    }

    const sortField = sort ?? 'createdAt';

    // Default: newest reviews first
    const direction: 1 | -1 = sort ? (order === 'asc' ? 1 : -1) : -1;

    const filter = {
      hotelId: hotel._id,
    };

    const [data, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .select('userId hotelId rating comment createdAt updatedAt')
        .populate('userId', 'firstName lastName')
        .sort({
          [sortField]: direction,
          _id: direction,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.reviewModel.countDocuments(filter),
    ]);

    return {
      averageRating: hotel.averageRating,
      reviewCount: hotel.reviewCount,
      data,
      meta: buildMeta(total, page, limit),
    };
  }

  // ==========================================
  // HELPER: RECALCULATE HOTEL RATING
  // ==========================================

  private async updateHotelRating(
    hotelId: string,
    session: ClientSession,
  ): Promise<void> {
    const hotel = await this.hotelModel
      .findById(hotelId)
      .select('_id')
      .session(session);

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    const result = await this.reviewModel
      .aggregate<{
        averageRating: number;
        reviewCount: number;
      }>([
        {
          $match: {
            hotelId: hotel._id,
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            reviewCount: { $sum: 1 },
          },
        },
      ])
      .session(session);

    const averageRating =
      result.length > 0 ? Math.round(result[0].averageRating * 100) / 100 : 0;

    const reviewCount = result.length > 0 ? result[0].reviewCount : 0;

    const updateResult = await this.hotelModel.updateOne(
      { _id: hotel._id },
      {
        $set: {
          averageRating,
          reviewCount,
        },
      },
      { session },
    );

    if (updateResult.matchedCount !== 1) {
      throw new NotFoundException('Hotel not found');
    }
  }

  // ==========================================
  // HELPER: VALIDATE MONGODB ID
  // ==========================================

  private validateId(id: string, entity: string): string {
    if (typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id)) {
      throw new BadRequestException(`Invalid ${entity} ID`);
    }

    return id.toLowerCase();
  }
}
