import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AirlinesModule } from './airlines/airlines.module.js';
import { FlightsModule } from './flights/flights.module.js';
import { FlightBookingsModule } from './flight-bookings/flight-bookings.module.js';
import { HotelsModule } from './hotels/hotels.module.js';
import { HotelBookingsModule } from './hotel-bookings/hotel-bookings.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ItinerariesModule } from './itineraries/itineraries.module.js';
import { BlogModule } from './blog/blog.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AuditLogsModule } from './audit-logs/audit-logs.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { ReferenceDataModule } from './reference-data/reference-data.module.js';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module.js';
import { AdminAccountsModule } from './admin/admin-accounts.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    AdminModule,
    AirlinesModule,
    AdminAccountsModule,
    FlightsModule,
    FlightBookingsModule,
    HotelsModule,
    HotelBookingsModule,
    ReviewsModule,
    PaymentsModule,
    ItinerariesModule,
    BlogModule,
    ReportsModule,
    NotificationsModule,
    AuditLogsModule,
    UploadsModule,
    ReferenceDataModule,
    ExchangeRatesModule,
  ],
})
export class AppModule {}
