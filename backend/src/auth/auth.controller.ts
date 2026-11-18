import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { Auth, CurrentUser } from './decorators.js';
import type { AuthUser } from './decorators.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto.js';
import { COOKIE_NAME } from './guards/jwt-auth.guard.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema.js';

const MAX_AGE_MS = Number(process.env.JWT_EXPIRES_MINUTES ?? 60) * 60 * 1000;
const cookieOpts = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: MAX_AGE_MS,
  path: '/',
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, @InjectModel(User.name) private users: Model<User>) {}

  @Post('register') @ApiOperation({ summary: 'ACC-01 Register a traveler account' })
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login') @HttpCode(200) @ApiOperation({ summary: 'ACC-04/05 Login (sets httpOnly cookie)' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto);
    res.cookie(COOKIE_NAME, token, cookieOpts());
    return { user };
  }

  @Post('logout') @HttpCode(200) @Auth() @ApiOperation({ summary: 'ACC-06 Logout' })
  async logout(@CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(u.id);
    res.clearCookie(COOKIE_NAME, { ...cookieOpts(), maxAge: undefined });
    return { message: 'Logged out' };
  }

  @Patch('change-password') @Auth() @ApiOperation({ summary: 'ACC-08 Change password' })
  async change(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const token = await this.auth.changePassword(u.id, dto);
    res.cookie(COOKIE_NAME, token, cookieOpts());
    return { message: 'Password changed' };
  }

  @Get('me') @Auth() @ApiOperation({ summary: 'ACC-04/19 Current session (role, assigned provider)' })
  async me(@CurrentUser() u: AuthUser) {
    return this.auth.sanitize(await this.users.findById(u.id).lean());
  }
}
