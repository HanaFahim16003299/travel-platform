
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ReviewsService } from './reviews.service.js';

import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';

import {
  Auth,
  CurrentUser,
} from '../auth/decorators.js';

import type {
  AuthUser,
} from '../auth/decorators.js';

import { Role } from '../common/enums/index.js';

import {
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';

@ApiTags('Hotel Reviews')
@Controller()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
  ) {}

  // HTL-23: Create review
  @Post('hotel-bookings/:id/review')
  @Auth(Role.User)
  @ApiOperation({
    summary: 'Review a hotel after a completed stay',
  })
  @ApiParam({
    name: 'id',
    description: 'Hotel booking ID',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(
      user.id,
      bookingId,
      dto,
    );
  }

  // HTL-23: Edit review
  @Patch('reviews/:id')
  @Auth(Role.User)
  @ApiOperation({
    summary: 'Edit my hotel review',
  })
  @ApiParam({
    name: 'id',
    description: 'Review ID',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(
      user.id,
      reviewId,
      dto,
    );
  }

  // HTL-23: Delete review
  @Delete('reviews/:id')
  @Auth(Role.User)
  @ApiOperation({
    summary: 'Delete my hotel review',
  })
  @ApiParam({
    name: 'id',
    description: 'Review ID',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') reviewId: string,
  ) {
    return this.reviewsService.remove(
      user.id,
      reviewId,
    );
  }

  // HTL-24: List reviews
  // No authentication required
  @Get('hotels/:id/reviews')
  @ApiOperation({
    summary: 'List public reviews for a hotel',
  })
  @ApiParam({
    name: 'id',
    description: 'Hotel ID',
  })
  findByHotel(
    @Param('id') hotelId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.findByHotel(
      hotelId,
      query,
    );
  }
}
