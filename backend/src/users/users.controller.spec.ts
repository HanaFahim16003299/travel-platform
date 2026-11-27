// ACC-12: account deactivation is refused while upcoming flight bookings exist.
// Added by Joumana Hozayen (review B1).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { UsersController } from './users.controller.js';
import { AccountStatus } from '../common/enums/index.js';

// The real schemas need decorator metadata that Vitest does not emit; the controller
// only needs the model and the bookings service, which the test passes in directly.
vi.mock('./schemas/user.schema.js', () => ({
  User: { name: 'User' },
  UserSchema: {},
}));
vi.mock('../flight-bookings/flight-bookings.service.js', () => ({
  FlightBookingsService: class {},
}));

describe('UsersController.deactivate (ACC-12)', () => {
  const me = { id: 'u1', email: 'u@test.com', role: 'user' } as never;
  const res = { clearCookie: vi.fn() };
  let user: Record<string, unknown> & { save: ReturnType<typeof vi.fn> };
  let flightBookings: {
    hasUpcomingConfirmedBookings: ReturnType<typeof vi.fn>;
  };
  let controller: UsersController;

  beforeEach(() => {
    user = {
      passwordHash: bcrypt.hashSync('Secret123', 4),
      status: AccountStatus.Active,
      tokenVersion: 0,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const users = {
      findById: vi
        .fn()
        .mockReturnValue({ select: vi.fn().mockResolvedValue(user) }),
    };
    flightBookings = { hasUpcomingConfirmedBookings: vi.fn() };
    controller = new UsersController(users as never, flightBookings as never);
  });

  it('refuses with 409 while the user has upcoming confirmed flight bookings', async () => {
    flightBookings.hasUpcomingConfirmedBookings.mockResolvedValue(true);

    await expect(
      controller.deactivate(me, { password: 'Secret123' }, res as never),
    ).rejects.toThrow(ConflictException);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('deactivates the account when there are no upcoming bookings', async () => {
    flightBookings.hasUpcomingConfirmedBookings.mockResolvedValue(false);

    await controller.deactivate(me, { password: 'Secret123' }, res as never);

    expect(user.status).toBe(AccountStatus.Deactivated);
    expect(user.save).toHaveBeenCalled();
  });
});
