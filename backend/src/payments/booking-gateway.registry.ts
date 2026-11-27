import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators.js';
import { BookingType } from './enums/payment.enums.js';

export interface PayableBooking {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  holdExpiresAt: Date;
  policyAcceptedAt: Date | null;
}

/**
 * Decoupled interface that each booking domain (flights, hotels) implements
 * so PaymentsModule never depends directly on booking modules.
 */
export interface BookingPaymentGateway {
  getPolicies(user: AuthUser, bookingId: string): Promise<unknown>;
  acceptPolicies(user: AuthUser, bookingId: string): Promise<unknown>;
  getPayableBooking(bookingId: string): Promise<PayableBooking>;
  confirmAfterPayment(bookingId: string, paymentId: string): Promise<boolean>;
  expireIfDue(bookingId: string): Promise<void>;
}

@Injectable()
export class BookingGatewayRegistry {
  private readonly gateways = new Map<BookingType, BookingPaymentGateway>();

  register(type: BookingType, gateway: BookingPaymentGateway): void {
    this.gateways.set(type, gateway);
  }

  get(type: BookingType): BookingPaymentGateway {
    const gateway = this.gateways.get(type);
    if (!gateway) {
      throw new NotFoundException(`No booking gateway registered for type "${type}"`);
    }
    return gateway;
  }
}
