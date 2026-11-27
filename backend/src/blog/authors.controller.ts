import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BlogService } from './blog.service.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';

// BLG-12
@ApiTags('Authors')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly blogService: BlogService) {}

  @Get(':id')
  @ApiOperation({ summary: 'View a public author page' })
  @ApiParam({ name: 'id', description: 'Author MongoDB id' })
  @ApiOkResponse({
    description: 'Safe public author profile and paginated published posts',
  })
  @ApiBadRequestResponse({ description: 'Invalid author id or pagination values' })
  @ApiNotFoundResponse({ description: 'Author not found' })
  findOne(@Param('id') id: string, @Query() query: ListPostsQueryDto) {
    return this.blogService.findAuthorPage(id, query);
  }
}
