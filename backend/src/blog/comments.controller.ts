import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';
import type { Request } from 'express';

@ApiTags('Comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // BLG-05
  @Post('posts/:id/comments')
  @Auth()
  @ApiOperation({ summary: 'Comment on a published post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiCreatedResponse({ description: 'Comment created' })
  @ApiBadRequestResponse({ description: 'Invalid post id or comment content' })
  @ApiNotFoundResponse({ description: 'Post not found or is not publicly available' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(user.id, postId, dto);
  }

  // BLG-05
  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'List comments for a published post in chronological order' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiOkResponse({ description: 'Paginated visible comments, oldest first' })
  @ApiBadRequestResponse({ description: 'Invalid post id or pagination values' })
  @ApiNotFoundResponse({ description: 'Post not found or is not publicly available' })
  findForPost(@Param('id') postId: string, @Query() query: ListCommentsQueryDto) {
    return this.commentsService.findForPost(postId, query);
  }

  // GEN-10
  @Get('comments/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'View a visible comment or your hidden comment' })
  @ApiParam({ name: 'id', description: 'Comment MongoDB id' })
  @ApiOkResponse({ description: 'Comment visible to the public, its author, or an admin' })
  @ApiBadRequestResponse({ description: 'Invalid comment id' })
  @ApiNotFoundResponse({ description: 'Comment not found or not visible to this viewer' })
  findOne(
    @Param('id') id: string,
    @Req() request: Request & { user?: AuthUser },
  ) {
    return this.commentsService.findOne(id, request.user);
  }

  // BLG-07
  @Patch('comments/:id')
  @Auth()
  @ApiOperation({ summary: 'Edit my comment' })
  @ApiParam({ name: 'id', description: 'Comment MongoDB id' })
  @ApiOkResponse({ description: 'Updated comment' })
  @ApiBadRequestResponse({ description: 'Invalid comment id or content' })
  @ApiForbiddenResponse({ description: 'The comment belongs to another author' })
  @ApiNotFoundResponse({ description: 'Comment not found' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(user.id, id, dto);
  }

  // BLG-07
  @Delete('comments/:id')
  @Auth()
  @ApiOperation({ summary: 'Delete my comment' })
  @ApiParam({ name: 'id', description: 'Comment MongoDB id' })
  @ApiOkResponse({ description: 'Comment deleted' })
  @ApiBadRequestResponse({ description: 'Invalid comment id' })
  @ApiForbiddenResponse({ description: 'The comment belongs to another author' })
  @ApiNotFoundResponse({ description: 'Comment not found' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commentsService.remove(user.id, id);
  }
}
