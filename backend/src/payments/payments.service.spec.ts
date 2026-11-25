import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../common/enums/index.js';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums.js';
import { PaymentsService } from './payments.service.js';

const USER_ID = new Types.ObjectId().toHexString();
const OTHER_USER_ID = new Types.ObjectId().toHexString();
const BOOKING_ID = new Types.ObjectId().toHexString();
const PAYMENT_ID = new Types.ObjectId();
const REFUND_ID = new Types.ObjectId();

const user = { id: USER_ID, email: 'yusuf@example.com', role: Role.User };
const otherUser = { id: OTHER_USER_ID, email: 'other@example.com', role: Role.User };
const adminUser = { id: OTHER_USER_ID, email: 'admin@example.com', role: Role.Admin };

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentModel: any;
  let refundModel: any;
  let flightBookingsService: any;
  let hotelBookingsService: any;
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

    flightBookingsService = {
      getPolicies: vi.fn(),
      acceptPolicies: vi.fn(),
      getPayableBooking: vi.fn(),
      confirmAfterPayment: vi.fn(),
      expireIfDue: vi.fn(),
    };
    hotelBookingsService = {
      getPolicies: vi.fn(),
      acceptPolicies: vi.fn(),
      getPayableBooking: vi.fn(),
      confirmBooking: vi.fn(),
      expireBooking: vi.fn(),
    };
    notificationsService = { create: vi.fn().mockResolvedValue(undefined) };

    const configService = {
      get: vi.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock';
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_mock';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new PaymentsService(
      paymentModel,
      refundModel,
      flightBookingsService,
      hotelBookingsService,
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
    (service as unknown as { stripe: unknown }).stripe = stripeMock;
  });

  it('PAY-02: delegates policy view & acceptance to the right booking service', async () => {
    flightBookingsService.getPolicies.mockResolvedValue({ bookingType: 'flight' });
    hotelBookingsService.acceptPolicies.mockResolvedValue({ accepted: true });

    await expect(service.getBookingPolicies(user, BookingType.Flight, BOOKING_ID)).resolves.toEqual({
      bookingType: 'flight',
    });
    await expect(service.acceptBookingPolicies(user, BookingType.Hotel, BOOKING_ID)).resolves.toEqual({
      accepted: true,
    });
  });

  it('PAY-01: rejects payment creation if policies were not accepted', async () => {
    flightBookingsService.getPayableBooking.mockResolvedValue({
      id: BOOKING_ID,
      userId: USER_ID,
      amount: 250,
      currency: 'USD',
      policyAcceptedAt: null,
    });

    await expect(
      service.createPayment(user, { bookingType: BookingType.Flight, bookingId: BOOKING_ID }),
    ).rejects.toThrow(ConflictException);
  });

  it('PAY-01: creates a Stripe PaymentIntent when policies are accepted', async () => {
    hotelBookingsService.getPayableBooking.mockResolvedValue({
      id: BOOKING_ID,
      userId: USER_ID,
      amount: 199.5,
      currency: 'usd',
      policyAcceptedAt: new Date('2026-11-01T10:00:00Z'),
    });
    paymentModel.findOne.mockResolvedValue(null);

    const res = await service.createPayment(user, {
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
    flightBookingsService.getPayableBooking.mockResolvedValue({
      id: BOOKING_ID,
      userId: USER_ID,
      amount: 300,
      currency: 'USD',
      policyAcceptedAt: new Date(),
    });
    stripeMock.paymentIntents.create.mockResolvedValue({ id: 'pi_new', client_secret: 'cs_new' });

    const res = await service.retryPayment(user, PAYMENT_ID.toHexString());
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith('pi_old');
    expect(res.stripePaymentIntentId).toBe('pi_new');
    expect(res.attemptCount).toBe(2);
    expect(res.status).toBe(PaymentStatus.Pending);
  });

  it('PAY-01: enforces ownership/admin on getPayment', async () => {
    paymentModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: PAYMENT_ID, userId: new Types.ObjectId(USER_ID) }),
    });

    await expect(service.getPayment(otherUser, PAYMENT_ID.toHexString())).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.getPayment(adminUser, PAYMENT_ID.toHexString())).resolves.toBeDefined();
  });

  it('PAY-01: rejects invalid webhook signatures', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Bad signature');
    });

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig_bad')).rejects.toThrow(
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
    flightBookingsService.confirmAfterPayment.mockResolvedValue({ _id: BOOKING_ID });

    const res = await service.handleWebhook(Buffer.from('{}'), 'sig_ok');
    expect(res).toEqual({ received: true, eventType: 'payment_intent.succeeded' });
    expect(flightBookingsService.confirmAfterPayment).toHaveBeenCalledWith(
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

    await service.handleWebhook(Buffer.from('{}'), 'sig_ok');
    expect(hotelBookingsService.expireBooking).toHaveBeenCalledWith(BOOKING_ID);
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

    const refund = await service.processRefundForBooking({
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
