import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema.js';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema.js';
import { AdminAccountsController } from './admin-accounts.controller.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AdminProvidersController, AirlinesListController } from './admin-providers.controller.js';
import { AdminProvidersService } from './admin-providers.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Hotel.name, schema: HotelSchema },
    ]),
  ],
  controllers: [
    AdminAccountsController,
    AdminProvidersController,
    AirlinesListController,
  ],
  providers: [
    AdminAccountsService,
    AdminProvidersService,
  ],
})
export class AdminAccountsModule {}