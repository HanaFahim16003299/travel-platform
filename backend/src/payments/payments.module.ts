import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingGatewayRegistry } from './booking-gateway.registry.js';
import { BookingPoliciesController } from './booking-policies.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import { Refund, RefundSchema } from './schemas/refund.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
    ]),
  ],
  controllers: [BookingPoliciesController, PaymentsController, RefundsController],
  providers: [BookingGatewayRegistry, PaymentsService, RefundsService],
  exports: [BookingGatewayRegistry, PaymentsService, RefundsService],
})
export class PaymentsModule {}
