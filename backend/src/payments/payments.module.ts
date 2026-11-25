import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module.js';
import { HotelBookingsModule } from '../hotel-bookings/hotel-bookings.module.js';
import { BookingPoliciesController } from './booking-policies.controller.js';
import { PaymentsController } from './payments.controller.js';
import { RefundsController } from './refunds.controller.js';
import { PaymentsService } from './payments.service.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import { Refund, RefundSchema } from './schemas/refund.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
    ]),
    forwardRef(() => FlightBookingsModule),
    forwardRef(() => HotelBookingsModule),
  ],
  controllers: [BookingPoliciesController, PaymentsController, RefundsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
