// Tests for the airline baggage and cancellation policy DTOs (FLT-08, FLT-09). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BaggagePolicyDto } from './baggage-policy.dto.js';
import { CancellationPolicyDto } from './cancellation-policy.dto.js';

const errorsOf = async (cls: new () => object, body: object) =>
  (await validate(plainToInstance(cls, body))).map((e) => e.property);

describe('BaggagePolicyDto (FLT-08)', () => {
  it('accepts a positive extra-bag price and a maximum of extra bags', async () => {
    expect(
      await errorsOf(BaggagePolicyDto, { extraBagPrice: 35, maxExtraBags: 2 }),
    ).toEqual([]);
  });

  it('rejects a zero or negative extra-bag price', async () => {
    expect(await errorsOf(BaggagePolicyDto, { extraBagPrice: 0 })).toContain(
      'extraBagPrice',
    );
    expect(await errorsOf(BaggagePolicyDto, { extraBagPrice: -5 })).toContain(
      'extraBagPrice',
    );
  });

  it('rejects a negative or fractional maximum of extra bags', async () => {
    expect(await errorsOf(BaggagePolicyDto, { maxExtraBags: -1 })).toContain(
      'maxExtraBags',
    );
    expect(await errorsOf(BaggagePolicyDto, { maxExtraBags: 1.5 })).toContain(
      'maxExtraBags',
    );
  });
});

describe('CancellationPolicyDto (FLT-09)', () => {
  it('accepts tiers with unique daysBefore values', async () => {
    const body = {
      tiers: [
        { daysBefore: 30, refundPercent: 100 },
        { daysBefore: 7, refundPercent: 50 },
        { daysBefore: 0, refundPercent: 0 },
      ],
    };
    expect(await errorsOf(CancellationPolicyDto, body)).toEqual([]);
  });

  it('rejects duplicate daysBefore values', async () => {
    const body = {
      tiers: [
        { daysBefore: 7, refundPercent: 50 },
        { daysBefore: 7, refundPercent: 20 },
      ],
    };
    expect(await errorsOf(CancellationPolicyDto, body)).toContain('tiers');
  });

  it('rejects a percentage above 100 or a negative or fractional daysBefore', async () => {
    expect(
      await errorsOf(CancellationPolicyDto, {
        tiers: [{ daysBefore: 7, refundPercent: 120 }],
      }),
    ).toContain('tiers');
    expect(
      await errorsOf(CancellationPolicyDto, {
        tiers: [{ daysBefore: -1, refundPercent: 10 }],
      }),
    ).toContain('tiers');
    expect(
      await errorsOf(CancellationPolicyDto, {
        tiers: [{ daysBefore: 1.5, refundPercent: 10 }],
      }),
    ).toContain('tiers');
  });
});
