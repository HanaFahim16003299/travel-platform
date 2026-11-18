import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';

@Module({ controllers: [UsersController] }) // User model comes from the @Global AuthModule
export class UsersModule {}
