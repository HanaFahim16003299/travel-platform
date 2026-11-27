import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BlogService } from './blog.service.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { TagParamDto } from './dto/tag-param.dto.js';

// BLG-08
@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly blogService: BlogService) {}

  @Get(':tag/posts')
  @ApiOperation({ summary: 'List published posts with a tag' })
  @ApiParam({ name: 'tag', description: 'Tag to match, case-insensitively' })
  @ApiOkResponse({ description: 'Paginated published posts with this tag' })
  @ApiBadRequestResponse({ description: 'Invalid tag or pagination values' })
  findPosts(@Param() params: TagParamDto, @Query() query: ListPostsQueryDto) {
    return this.blogService.findPublished({
      page: query.page,
      limit: query.limit,
      tag: params.tag,
      keyword: query.keyword,
    });
  }
}
