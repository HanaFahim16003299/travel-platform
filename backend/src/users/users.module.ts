import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module.js';

// User model comes from the @Global AuthModule. FlightBookingsModule: ACC-12 check (Joumana Hozayen, review B1).
@Module({ imports: [FlightBookingsModule], controllers: [UsersController] })
export class UsersModule {}
