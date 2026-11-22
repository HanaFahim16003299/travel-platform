import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
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
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { BlogService } from './blog.service.js';

@ApiTags('Posts')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // BLG-01
  @HttpPost()
  @Auth()
  @ApiOperation({ summary: 'Create a post' })
  @ApiCreatedResponse({ description: 'Post created' })
  @ApiBadRequestResponse({ description: 'Invalid post data' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.blogService.create(user.id, dto);
  }

  // BLG-02, BLG-08, BLG-09
  @Get()
  @ApiOperation({ summary: 'Browse or search published posts' })
  @ApiOkResponse({ description: 'Paginated published posts; empty items means no results' })
  @ApiBadRequestResponse({ description: 'Invalid pagination or filter values' })
  findPublished(@Query() query: ListPostsQueryDto) {
    return this.blogService.findPublished(query);
  }

  // BLG-03 - must precede the :id route
  @Get('mine')
  @Auth()
  @ApiOperation({ summary: 'List my posts, including drafts' })
  @ApiOkResponse({ description: 'Paginated posts owned by the current user' })
  @ApiBadRequestResponse({ description: 'Invalid pagination values' })
  findMine(@CurrentUser() user: AuthUser, @Query() query: ListPostsQueryDto) {
    return this.blogService.findMine(user.id, query);
  }

  // BLG-02
  @Get(':id')
  @ApiOperation({ summary: 'View a published post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiOkResponse({ description: 'Published post details and author' })
  @ApiBadRequestResponse({ description: 'Invalid post id' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  findOne(@Param('id') id: string) {
    return this.blogService.findOne(id);
  }

  // BLG-04, BLG-08
  @Patch(':id')
  @Auth()
  @ApiOperation({ summary: 'Edit my post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiOkResponse({ description: 'Updated post' })
  @ApiBadRequestResponse({ description: 'Invalid id or post data' })
  @ApiForbiddenResponse({ description: 'The post belongs to another author' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.blogService.update(user.id, id, dto);
  }

  // BLG-04
  @Delete(':id')
  @Auth()
  @ApiOperation({ summary: 'Delete my post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiOkResponse({ description: 'Post deleted' })
  @ApiBadRequestResponse({ description: 'Invalid post id' })
  @ApiForbiddenResponse({ description: 'The post belongs to another author' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blogService.remove(user.id, id);
  }
}
