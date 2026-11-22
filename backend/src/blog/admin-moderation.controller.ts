import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { Role } from '../common/enums/index.js';
import { ListReportsQueryDto } from './dto/list-reports-query.dto.js';
import { ReportTargetParamDto } from './dto/report-target-param.dto.js';
import { ReviewReportDto } from './dto/review-report.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Admin Content Moderation')
@Controller('admin')
export class AdminModerationController {
  constructor(private readonly reportsService: ReportsService) {}

  // GEN-10
  @Get('reports')
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'List and filter content reports' })
  @ApiOkResponse({ description: 'Paginated reports with their target content' })
  @ApiBadRequestResponse({ description: 'Invalid report filters or pagination' })
  listReports(@Query() query: ListReportsQueryDto) {
    return this.reportsService.list(query);
  }

  // GEN-07, GEN-10
  @Patch('reports/:id')
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Dismiss, hide, or delete reported content' })
  @ApiParam({ name: 'id', description: 'Report MongoDB id' })
  @ApiOkResponse({ description: 'Report reviewed and moderation action recorded' })
  @ApiBadRequestResponse({ description: 'Invalid report id or review action' })
  @ApiConflictResponse({ description: 'Report has already been reviewed' })
  @ApiNotFoundResponse({ description: 'Report or target content not found' })
  review(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.reportsService.review(admin.id, id, dto);
  }

  // GEN-07, GEN-10
  @Delete('content/:type/:id')
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Delete a post or comment directly' })
  @ApiParam({ name: 'type', description: 'Content type: post or comment' })
  @ApiParam({ name: 'id', description: 'Content MongoDB id' })
  @ApiOkResponse({ description: 'Content and dependent post content deleted' })
  @ApiBadRequestResponse({ description: 'Invalid content type or id' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  deleteContent(
    @CurrentUser() admin: AuthUser,
    @Param() params: ReportTargetParamDto,
    @Param('id') id: string,
  ) {
    return this.reportsService.deleteContent(admin.id, params.type, id);
  }
}
