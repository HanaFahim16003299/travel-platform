import { Controller, Get, Param, ParseEnumPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { ProviderType, Role } from '../common/enums/index.js';
import { AdminProvidersService } from './admin-providers.service.js';
import { ListProvidersQuery } from './dto/admin.dto.js';

@ApiTags('Admin - Providers')
@Auth(Role.Admin)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private svc: AdminProvidersService) {}

  @Get(':type') @ApiOperation({ summary: 'List all hotels or airlines, including inactive (admin)' })
  list(@Param('type', new ParseEnumPipe(ProviderType)) type: ProviderType, @Query() q: ListProvidersQuery) {
    return this.svc.list(type, q, true);
  }

  @Patch(':type/:id/deactivate') @ApiOperation({ summary: 'ACC-15 Deactivate a hotel or airline' })
  deactivate(@CurrentUser() a: AuthUser, @Param('type', new ParseEnumPipe(ProviderType)) type: ProviderType, @Param('id') id: string) {
    return this.svc.setActive(a.id, type, id, false);
  }

  @Patch(':type/:id/reactivate') @ApiOperation({ summary: 'ACC-15 Reactivate a hotel or airline' })
  reactivate(@CurrentUser() a: AuthUser, @Param('type', new ParseEnumPipe(ProviderType)) type: ProviderType, @Param('id') id: string) {
    return this.svc.setActive(a.id, type, id, true);
  }
}

@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesListController {
  constructor(private svc: AdminProvidersService) {}

  @Get() @ApiOperation({ summary: 'List active airlines (public, searchable, paginated)' })
  list(@Query() q: ListProvidersQuery) {
    return this.svc.list(ProviderType.Airline, q, false);
  }
}
