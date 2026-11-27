// A6: the temporary dev-confirm endpoint is gone now that Stripe confirms bookings.
// Added by Joumana Hozayen.
import { describe, expect, it, vi } from 'vitest';
import { PATH_METADATA } from '@nestjs/common/constants.js';

// The real schemas need decorator metadata that Vitest does not emit.
vi.mock('../users/schemas/user.schema.js', () => ({
  User: { name: 'User' },
  UserSchema: {},
}));

const { FlightBookingsController } =
  await import('./flight-bookings.controller.js');

describe('FlightBookingsController routes (review A6)', () => {
  it('no longer exposes POST /flight-bookings/:id/dev-confirm', () => {
    const proto = FlightBookingsController.prototype as unknown as Record<
      string,
      unknown
    >;
    const paths = Object.getOwnPropertyNames(proto)
      .filter((name) => typeof proto[name] === 'function')
      .map(
        (name) =>
          Reflect.getMetadata(PATH_METADATA, proto[name] as object) as
            string | undefined,
      );

    expect(paths).not.toContain(':id/dev-confirm');
    expect(paths).toContain(':id/cancel'); // the real routes are still there
    expect('devConfirm' in proto).toBe(false);
  });
});
