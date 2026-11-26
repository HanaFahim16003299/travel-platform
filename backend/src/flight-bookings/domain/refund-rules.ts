// Refund calculation for flight booking cancellations (FLT-09, FLT-26). Pure function, no `this`.
// Added by Joumana Hozayen.
import { round2 } from './pricing.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface RefundPolicyLeg {
  departureAt: Date;
  cancellationTiers?: { daysBefore: number; refundPercent: number }[];
  refundable: boolean;
  refundPercentage: number;
  cancellationFee: number;
  cancellationDeadlineHours: number;
}

export interface RefundInput {
  totalPrice: number;
  currency: string;
  segments: RefundPolicyLeg[];
}

export interface RefundQuote {
  daysBeforeDeparture: number;
  refundPercent: number;
  cancellationFee: number;
  refundAmount: number;
  currency: string;
  rule: string;
}

/**
 * Refund rule, based on the first leg's departure and the policy copied onto the booking:
 *  - If the airline has tiers (FLT-09): the highest daysBefore threshold that still applies
 *    wins; no match = 0%.
 *  - Otherwise the airline's single policy: non-refundable = 0; inside the deadline = 0;
 *    else total × refundPercentage − cancellationFee.
 */
export function computeRefund(
  b: RefundInput,
  now: Date = new Date(),
): RefundQuote {
  const seg = b.segments[0];
  const msLeft = seg.departureAt.getTime() - now.getTime();
  const daysBeforeDeparture = Math.floor(msLeft / DAY_MS);
  let refundPercent = 0;
  let fee = 0;
  let rule: string;

  if (seg.cancellationTiers?.length) {
    const tiers = [...seg.cancellationTiers].sort(
      (a, c) => c.daysBefore - a.daysBefore,
    );
    const tier = tiers.find((t) => daysBeforeDeparture >= t.daysBefore);
    refundPercent = tier?.refundPercent ?? 0;
    rule = tier
      ? `Cancelled ${daysBeforeDeparture} days before departure: ${tier.daysBefore}+ days tier gives ${refundPercent}%`
      : `Cancelled ${daysBeforeDeparture} days before departure: no tier applies, 0%`;
  } else if (!seg.refundable) {
    rule = 'Non-refundable fare';
  } else if (msLeft < seg.cancellationDeadlineHours * HOUR_MS) {
    rule = `Cancelled within ${seg.cancellationDeadlineHours} hours of departure: no refund`;
  } else {
    refundPercent = seg.refundPercentage;
    fee = seg.cancellationFee;
    rule = `${refundPercent}% refund minus ${fee} ${b.currency} cancellation fee`;
  }

  const refundAmount = Math.max(
    0,
    round2((b.totalPrice * refundPercent) / 100 - fee),
  );
  return {
    daysBeforeDeparture,
    refundPercent,
    cancellationFee: fee,
    refundAmount,
    currency: b.currency,
    rule,
  };
}
