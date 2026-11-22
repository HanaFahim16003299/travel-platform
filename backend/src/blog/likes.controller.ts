import { Controller, Delete, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { LikesService } from './likes.service.js';

@ApiTags('Likes')
@Controller('posts')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  // BLG-06
  @Post(':id/like')
  @Auth()
  @ApiOperation({ summary: 'Like a published post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiCreatedResponse({ description: 'Like added and like count updated' })
  @ApiBadRequestResponse({ description: 'Invalid post id' })
  @ApiConflictResponse({ description: 'The current user already liked this post' })
  @ApiNotFoundResponse({ description: 'Post not found or is not publicly available' })
  like(@CurrentUser() user: AuthUser, @Param('id') postId: string) {
    return this.likesService.like(user.id, postId);
  }

  // BLG-06
  @Delete(':id/like')
  @Auth()
  @ApiOperation({ summary: 'Remove my like from a published post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiOkResponse({ description: 'Like removed and like count updated' })
  @ApiBadRequestResponse({ description: 'Invalid post id' })
  @ApiConflictResponse({ description: 'The current user has not liked this post' })
  @ApiNotFoundResponse({ description: 'Post not found or is not publicly available' })
  unlike(@CurrentUser() user: AuthUser, @Param('id') postId: string) {
    return this.likesService.unlike(user.id, postId);
  }
}
