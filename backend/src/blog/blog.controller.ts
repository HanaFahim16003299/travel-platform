import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import type { Request } from 'express';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { BlogService } from './blog.service.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';
import { imageUploadOptions } from '../uploads/image-upload.options.js';
import { ImageUploadExceptionFilter } from './image-upload-exception.filter.js';

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

  // BLG-10, GEN-08
  @HttpPost(':id/images')
  @Auth()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions()))
  @UseFilters(ImageUploadExceptionFilter)
  @ApiOperation({ summary: 'Attach a JPG or PNG image to my post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ description: 'Image attached to the post' })
  @ApiBadRequestResponse({
    description: 'Missing file, unsupported format, size limit, or image-count limit',
  })
  @ApiForbiddenResponse({ description: 'The post belongs to another author' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  addImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.blogService.addImage(user.id, id, file);
  }

  // BLG-10, GEN-08
  @Delete(':id/images/:imageId')
  @Auth()
  @ApiOperation({ summary: 'Remove an image from my post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiOkResponse({ description: 'Image removed from the post and storage' })
  @ApiBadRequestResponse({ description: 'Invalid post id or image id' })
  @ApiForbiddenResponse({ description: 'The post belongs to another author' })
  @ApiNotFoundResponse({ description: 'Post or image not found' })
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.blogService.removeImage(user.id, id, imageId);
  }

  // BLG-02
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'View a post; hidden or draft posts require owner or admin access' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiOkResponse({ description: 'Post details and author' })
  @ApiBadRequestResponse({ description: 'Invalid post id' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  findOne(
    @Param('id') id: string,
    @Req() request: Request & { user?: AuthUser },
  ) {
    return this.blogService.findOne(id, request.user);
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
