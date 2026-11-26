// Tests for the cancellation refund rules (FLT-09, FLT-26). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { computeRefund, type RefundPolicyLeg } from './refund-rules.js';

const NOW = new Date('2027-01-01T00:00:00Z');
const daysFromNow = (d: number) =>
  new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);
const leg = (over: Partial<RefundPolicyLeg> = {}): RefundPolicyLeg => ({
  departureAt: daysFromNow(10),
  cancellationTiers: [],
  refundable: false,
  refundPercentage: 0,
  cancellationFee: 0,
  cancellationDeadlineHours: 0,
  ...over,
});
const tiers = [
  { daysBefore: 1, refundPercent: 10 },
  { daysBefore: 30, refundPercent: 100 },
  { daysBefore: 7, refundPercent: 50 },
];
const booking = (l: RefundPolicyLeg) => ({
  totalPrice: 400,
  currency: 'USD',
  segments: [l],
});

describe('computeRefund', () => {
  it('uses the highest tier that is not above the days left', () => {
    const q = computeRefund(
      booking(leg({ departureAt: daysFromNow(10), cancellationTiers: tiers })),
      NOW,
    );
    expect(q.refundPercent).toBe(50);
    expect(q.refundAmount).toBe(200);
  });

  it('applies a tier exactly on its threshold', () => {
    expect(
      computeRefund(
        booking(
          leg({ departureAt: daysFromNow(30), cancellationTiers: tiers }),
        ),
        NOW,
      ).refundPercent,
    ).toBe(100);
  });

  it('gives 0% when no tier applies', () => {
    const q = computeRefund(
      booking(leg({ departureAt: daysFromNow(0.5), cancellationTiers: tiers })),
      NOW,
    );
    expect(q.refundPercent).toBe(0);
    expect(q.refundAmount).toBe(0);
  });

  it('falls back to the single-rule policy and subtracts the fee', () => {
    const q = computeRefund(
      booking(
        leg({ refundable: true, refundPercentage: 80, cancellationFee: 20 }),
      ),
      NOW,
    );
    expect(q.refundAmount).toBe(300); // 80% of 400 − 20
  });

  it('gives nothing inside the cancellation deadline or for non-refundable fares', () => {
    expect(
      computeRefund(
        booking(
          leg({
            departureAt: daysFromNow(1),
            refundable: true,
            refundPercentage: 80,
            cancellationDeadlineHours: 48,
          }),
        ),
        NOW,
      ).refundAmount,
    ).toBe(0);
    expect(computeRefund(booking(leg()), NOW).rule).toBe('Non-refundable fare');
  });

  it('never returns a negative refund', () => {
    expect(
      computeRefund(
        booking(
          leg({ refundable: true, refundPercentage: 1, cancellationFee: 50 }),
        ),
        NOW,
      ).refundAmount,
    ).toBe(0);
  });
});
