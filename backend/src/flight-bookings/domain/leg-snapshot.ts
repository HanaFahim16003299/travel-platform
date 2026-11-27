// Detects that a flight's price or airline policies changed after a draft was made (review C4).
// Pure function, no `this`. Added by Joumana Hozayen.

/** The parts of a leg the user agreed to in the booking summary (FLT-21) and the policies (PAY-02). */
const AGREED_FIELDS = [
  'unitPrice',
  'freeCheckedBags',
  'checkedBagWeightKg',
  'extraBagPrice',
  'maxExtraBags',
  'cancellationTiers',
  'refundable',
  'refundPercentage',
  'cancellationFee',
  'cancellationDeadlineHours',
] as const;

type AgreedLeg = { [K in (typeof AGREED_FIELDS)[number]]?: unknown };

const agreedPart = (leg: AgreedLeg) =>
  JSON.stringify(
    AGREED_FIELDS.map((field) => {
      const value = leg[field];
      // Mongoose arrays carry extra properties; compare plain tier values only.
      return field === 'cancellationTiers'
        ? (
            (value as
              { daysBefore: number; refundPercent: number }[] | undefined) ?? []
          ).map((t) => [t.daysBefore, t.refundPercent])
        : (value ?? null);
    }),
  );

/** True when any leg's price or policies differ from what the draft recorded. */
export function legsChanged(
  draftLegs: AgreedLeg[],
  currentLegs: AgreedLeg[],
): boolean {
  return (
    draftLegs.length !== currentLegs.length ||
    draftLegs.some((leg, i) => agreedPart(leg) !== agreedPart(currentLegs[i]))
  );
}
