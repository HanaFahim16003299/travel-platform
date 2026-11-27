import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportsService } from './reports.service.js';
import { ReportTargetType } from './blog.constants.js';

// GEN-09
@ApiTags('Content Reports')
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('posts/:id/report')
  @Auth()
  @ApiOperation({ summary: 'Report a published post' })
  @ApiParam({ name: 'id', description: 'Post MongoDB id' })
  @ApiCreatedResponse({ description: 'Report submitted' })
  @ApiBadRequestResponse({ description: 'Invalid post id or report reason' })
  @ApiConflictResponse({ description: 'You already reported this content' })
  @ApiNotFoundResponse({ description: 'Post not found or not visible' })
  reportPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportsService.submit(user.id, ReportTargetType.Post, id, dto);
  }

  @Post('comments/:id/report')
  @Auth()
  @ApiOperation({ summary: 'Report a visible comment' })
  @ApiParam({ name: 'id', description: 'Comment MongoDB id' })
  @ApiCreatedResponse({ description: 'Report submitted' })
  @ApiBadRequestResponse({ description: 'Invalid comment id or report reason' })
  @ApiConflictResponse({ description: 'You already reported this content' })
  @ApiNotFoundResponse({ description: 'Comment not found or not visible' })
  reportComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportsService.submit(user.id, ReportTargetType.Comment, id, dto);
  }
}
