import { Body, Controller, Delete, Get, HttpCode, Patch, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { Auth, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import { COOKIE_NAME } from '../auth/guards/jwt-auth.guard.js';
import { User } from './schemas/user.schema.js';
import { DeactivateAccountDto, UpdateProfileDto } from './dto/users.dto.js';
import { AccountStatus } from '../common/enums/index.js';

const HIDE = '-tokenVersion -failedLoginAttempts -lockUntil -__v';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(@InjectModel(User.name) private users: Model<User>) {}

  @Get('me') @Auth() @ApiOperation({ summary: 'ACC-11 View my profile' })
  me(@CurrentUser() u: AuthUser) {
    return this.users.findById(u.id).select(HIDE).lean();
  }

  @Patch('me') @Auth() @ApiOperation({ summary: 'ACC-09 Update my profile (email/role cannot change)' })
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    const set: Record<string, unknown> = {};
    for (const k of ['firstName', 'lastName', 'phone'] as const) if (dto[k] !== undefined) set[k] = dto[k];
    if (dto.preferences?.currency) set['preferences.currency'] = dto.preferences.currency.toUpperCase();
    if (dto.preferences?.language) set['preferences.language'] = dto.preferences.language;
    return this.users.findByIdAndUpdate(u.id, { $set: set }, { new: true }).select(HIDE).lean();
  }

  @Delete('me') @HttpCode(200) @Auth() @ApiOperation({ summary: 'ACC-12 Deactivate my account (password confirmation)' })
  async deactivate(@CurrentUser() u: AuthUser, @Body() dto: DeactivateAccountDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.users.findById(u.id).select('+passwordHash');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Password is incorrect');
    // TODO: check Excel ACC-12 - may need to block if the user has upcoming confirmed bookings.
    user.status = AccountStatus.Deactivated;
    user.deactivatedAt = new Date();
    user.tokenVersion += 1;
    await user.save();
    res.clearCookie(COOKIE_NAME);
    return { message: 'Account deactivated' };
  }
}
