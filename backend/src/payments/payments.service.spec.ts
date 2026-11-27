import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../common/enums/index.js';
import { BookingGatewayRegistry } from './booking-gateway.registry.js';
import type { BookingPaymentGateway } from './booking-gateway.registry.js';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums.js';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';

const USER_ID = new Types.ObjectId().toHexString();
const OTHER_USER_ID = new Types.ObjectId().toHexString();
const BOOKING_ID = new Types.ObjectId().toHexString();
const PAYMENT_ID = new Types.ObjectId();
const REFUND_ID = new Types.ObjectId();

const user = { id: USER_ID, email: 'yusuf@example.com', role: Role.User };
const otherUser = { id: OTHER_USER_ID, email: 'other@example.com', role: Role.User };
const adminUser = { id: OTHER_USER_ID, email: 'admin@example.com', role: Role.Admin };

describe('PaymentsService & RefundsService', () => {
  let paymentsService: PaymentsService;
  let refundsService: RefundsService;
  let gatewayRegistry: BookingGatewayRegistry;
  let flightGateway: BookingPaymentGateway & Record<string, ReturnType<typeof vi.fn>>;
  let hotelGateway: BookingPaymentGateway & Record<string, ReturnType<typeof vi.fn>>;
  let flightConfirmAfterPaymentMock: ReturnType<typeof vi.fn>;
  let hotelExpireIfDueMock: ReturnType<typeof vi.fn>;
  let paymentModel: any;
  let refundModel: any;
  let notificationsService: any;
  let stripeMock: any;

  beforeEach(() => {
    const paymentSave = vi.fn().mockResolvedValue(undefined);
    paymentModel = vi.fn(function (data: Record<string, unknown>) {
      return {
        _id: PAYMENT_ID,
        ...data,
        save: paymentSave,
      };
    });
    paymentModel.findOne = vi.fn();
    paymentModel.findById = vi.fn();

    const refundSave = vi.fn().mockResolvedValue(undefined);
    refundModel = vi.fn(function (data: Record<string, unknown>) {
      return {
        _id: REFUND_ID,
        ...data,
        save: refundSave,
      };
    });
    refundModel.findById = vi.fn();

    flightConfirmAfterPaymentMock = vi.fn();
    hotelExpireIfDueMock = vi.fn();

    flightGateway = {
      getPolicies: vi.fn(),
      acceptPolicies: vi.fn(),
      getPayableBooking: vi.fn(),
      confirmAfterPayment: flightConfirmAfterPaymentMock as any,
      expireIfDue: vi.fn(),
    };
    hotelGateway = {
      getPolicies: vi.fn(),
      acceptPolicies: vi.fn(),
      getPayableBooking: vi.fn(),
      confirmAfterPayment: vi.fn(),
      expireIfDue: hotelExpireIfDueMock as any,
    };

    gatewayRegistry = new BookingGatewayRegistry();
    gatewayRegistry.register(BookingType.Flight, flightGateway);
    gatewayRegistry.register(BookingType.Hotel, hotelGateway);

    notificationsService = { create: vi.fn().mockResolvedValue(undefined) };

    const configService = {
      get: vi.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock';
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_mock';
        return undefined;
      }),
    } as unknown as ConfigService;

    refundsService = new RefundsService(
      refundModel,
      paymentModel,
      notificationsService,
      configService,
    );

    paymentsService = new PaymentsService(
      paymentModel,
      gatewayRegistry,
      refundsService,
      notificationsService,
      configService,
    );

    stripeMock = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({ id: 'pi_123', client_secret: 'cs_123' }),
        cancel: vi.fn().mockResolvedValue({ id: 'pi_123', status: 'canceled' }),
      },
      refunds: {
        create: vi.fn().mockResolvedValue({ id: 're_123' }),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    };
    (paymentsService as unknown as { stripe: unknown }).stripe = stripeMock;
    (refundsService as unknown as { stripe: unknown }).stripe = stripeMock;
  });

  it('PAY-02: resolves the registered gateway for flight and hotel policies', async () => {
    flightGateway.getPolicies.mockResolvedValue({ bookingType: 'flight' });
    hotelGateway.acceptPolicies.mockResolvedValue({ accepted: true });

    await expect(
      gatewayRegistry.get(BookingType.Flight).getPolicies(user, BOOKING_ID),
    ).resolves.toEqual({ bookingType: 'flight' });
    await expect(
      gatewayRegistry.get(BookingType.Hotel).acceptPolicies(user, BOOKING_ID),
    ).resolves.toEqual({ accepted: true });
  });

  it('PAY-01: rejects payment creation if policies were not accepted', async () => {
    flightGateway.getPayableBooking.mockResolvedValue({
      id: BOOKING_ID,
      userId: USER_ID,
      amount: 250,
      currency: 'USD',
      holdExpiresAt: new Date(Date.now() + 60_000),
      policyAcceptedAt: null,
    });

    await expect(
      paymentsService.createPayment(user, { bookingType: BookingType.Flight, bookingId: BOOKING_ID }),
    ).rejects.toThrow(ConflictException);
  });

  it('PAY-01: creates a Stripe PaymentIntent when policies are accepted', async () => {
    hotelGateway.getPayableBooking.mockResolvedValue({
      id: BOOKING_ID,
      userId: USER_ID,
      amount: 199.5,
      currency: 'usd',
      holdExpiresAt: new Date(Date.now() + 60_000),
      policyAcceptedAt: new Date('2026-11-01T10:00:00Z'),
    });
    paymentModel.findOne.mockResolvedValue(null);

    const res = await paymentsService.createPayment(user, {
      bookingType: BookingType.Hotel,
      bookingId: BOOKING_ID,
    });

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 19950, currency: 'usd' }),
    );
    expect(res.stripePaymentIntentId).toBe('pi_123');
    expect(res.clientSecret).toBe('cs_123');
  });

  it('PAY-01: retries a failed payment and increments attemptCount', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    paymentModel.findById.mockResolvedValue({
      _id: PAYMENT_ID,
      userId: new Types.ObjectId(USER_ID),
      bookingType: BookingType.Flight,
      bookingId: new Types.ObjectId(BOOKING_ID),
      status: PaymentStatus.Failed,
      stripePaymentIntentId: 'pi_old',
      attemptCount: 1,
      save,
    });
    flightGateway.getPayableBooking.mockResolvedValue({
      id: BOOKING_ID,
      userId: USER_ID,
      amount: 300,
      currency: 'USD',
      holdExpiresAt: new Date(Date.now() + 60_000),
      policyAcceptedAt: new Date(),
    });
    stripeMock.paymentIntents.create.mockResolvedValue({ id: 'pi_new', client_secret: 'cs_new' });

    const res = await paymentsService.retryPayment(user, PAYMENT_ID.toHexString());
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith('pi_old');
    expect(res.stripePaymentIntentId).toBe('pi_new');
    expect(res.attemptCount).toBe(2);
    expect(res.status).toBe(PaymentStatus.Pending);
  });

  it('PAY-01: enforces ownership/admin on getPayment', async () => {
    paymentModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: PAYMENT_ID, userId: new Types.ObjectId(USER_ID) }),
    });

    await expect(paymentsService.getPayment(otherUser, PAYMENT_ID.toHexString())).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      paymentsService.getPayment(adminUser, PAYMENT_ID.toHexString()),
    ).resolves.toBeDefined();
  });

  it('PAY-01: rejects invalid webhook signatures', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Bad signature');
    });

    await expect(paymentsService.handleWebhook(Buffer.from('{}'), 'sig_bad')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('PAY-01: confirms flight booking on payment_intent.succeeded webhook', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    paymentModel.findOne.mockResolvedValue({
      _id: PAYMENT_ID,
      userId: new Types.ObjectId(USER_ID),
      bookingType: BookingType.Flight,
      bookingId: new Types.ObjectId(BOOKING_ID),
      amount: 200,
      currency: 'USD',
      status: PaymentStatus.Pending,
      save,
    });
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123' } },
    });
    flightConfirmAfterPaymentMock.mockResolvedValue(true);

    const res = await paymentsService.handleWebhook(Buffer.from('{}'), 'sig_ok');
    expect(res).toEqual({ received: true, eventType: 'payment_intent.succeeded' });
    expect(flightConfirmAfterPaymentMock).toHaveBeenCalledWith(
      BOOKING_ID,
      PAYMENT_ID.toHexString(),
    );
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('PAY-01: releases expired inventory on payment_intent.payment_failed webhook', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    paymentModel.findOne.mockResolvedValue({
      _id: PAYMENT_ID,
      userId: new Types.ObjectId(USER_ID),
      bookingType: BookingType.Hotel,
      bookingId: new Types.ObjectId(BOOKING_ID),
      amount: 150,
      currency: 'USD',
      status: PaymentStatus.Pending,
      save,
    });
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_123', last_payment_error: { message: 'Card declined' } } },
    });

    await paymentsService.handleWebhook(Buffer.from('{}'), 'sig_ok');
    expect(hotelExpireIfDueMock).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('PAY-03: processes a refund and updates Payment status', async () => {
    const paymentSave = vi.fn().mockResolvedValue(undefined);
    const paymentDoc = {
      _id: PAYMENT_ID,
      userId: new Types.ObjectId(USER_ID),
      bookingType: BookingType.Flight,
      bookingId: new Types.ObjectId(BOOKING_ID),
      amount: 200,
      currency: 'USD',
      status: PaymentStatus.Succeeded,
      stripePaymentIntentId: 'pi_123',
      save: paymentSave,
    };
    paymentModel.findOne.mockResolvedValue(paymentDoc);

    const refund = await refundsService.processRefundForBooking({
      bookingType: BookingType.Flight,
      bookingId: BOOKING_ID,
      userId: USER_ID,
      amount: 100,
      currency: 'USD',
      reason: '50% policy refund',
    });

    expect(stripeMock.refunds.create).toHaveBeenCalledWith({
      payment_intent: 'pi_123',
      amount: 10000,
    });
    expect(refund?.status).toBe(RefundStatus.Succeeded);
    expect(paymentDoc.status).toBe(PaymentStatus.PartiallyRefunded);
  });
});
