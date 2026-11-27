import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
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
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service.js';

const HIDE = '-tokenVersion -failedLoginAttempts -lockUntil -__v';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    // ACC-12: added by Joumana Hozayen (review B1).
    private readonly flightBookings: FlightBookingsService,
  ) {}

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'ACC-11 View my profile' })
  me(@CurrentUser() u: AuthUser) {
    return this.users.findById(u.id).select(HIDE).lean();
  }

  @Patch('me')
  @Auth()
  @ApiOperation({
    summary: 'ACC-09 Update my profile (email/role cannot change)',
  })
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    const set: Record<string, unknown> = {};
    for (const k of ['firstName', 'lastName', 'phone'] as const)
      if (dto[k] !== undefined) set[k] = dto[k];
    if (dto.preferences?.currency)
      set['preferences.currency'] = dto.preferences.currency.toUpperCase();
    if (dto.preferences?.language)
      set['preferences.language'] = dto.preferences.language;
    return this.users
      .findByIdAndUpdate(u.id, { $set: set }, { new: true })
      .select(HIDE)
      .lean();
  }

  @Delete('me')
  @HttpCode(200)
  @Auth()
  @ApiOperation({
    summary:
      'ACC-12 Deactivate my account (password confirmation). Refused with 409 while you have upcoming confirmed flight bookings.',
  })
  async deactivate(
    @CurrentUser() u: AuthUser,
    @Body() dto: DeactivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.users.findById(u.id).select('+passwordHash');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Password is incorrect');
    // ACC-12: not allowed while upcoming confirmed flight bookings exist (review B1, Joumana Hozayen).
    // TODO (hotel bookings owner): add the same check for confirmed hotel stays.
    if (await this.flightBookings.hasUpcomingConfirmedBookings(u.id))
      throw new ConflictException(
        'You cannot deactivate your account while you have upcoming confirmed flight bookings. Cancel them or wait until they are completed.',
      );
    user.status = AccountStatus.Deactivated;
    user.deactivatedAt = new Date();
    user.tokenVersion += 1;
    await user.save();
    res.clearCookie(COOKIE_NAME);
    return { message: 'Account deactivated' };
  }
}
