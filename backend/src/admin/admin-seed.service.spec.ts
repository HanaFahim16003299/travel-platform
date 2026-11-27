import bcrypt from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../common/enums/index.js';
import { AdminSeedService } from './admin-seed.service.js';

// The real schema cannot be built by Vitest (it has no decorator metadata), and this test uses a fake model.
vi.mock('../users/schemas/user.schema.js', () => ({ User: { name: 'User' }, UserSchema: {} }));

const GOOD_PASSWORD = 'Admin12345';

function build(existing: { role: string } | null = null) {
  const lean = vi.fn().mockResolvedValue(existing);
  const select = vi.fn().mockReturnValue({ lean });
  const findOne = vi.fn().mockReturnValue({ select });
  const create = vi.fn().mockResolvedValue({});
  const service = new AdminSeedService({ findOne, create } as never);
  return { service, findOne, create };
}

describe('AdminSeedService', () => {
  const saved = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };

  beforeEach(() => {
    process.env.ADMIN_EMAIL = 'Admin@Travel.test';
    process.env.ADMIN_PASSWORD = GOOD_PASSWORD;
  });
  afterEach(() => {
    if (saved.email === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = saved.email;
    if (saved.password === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = saved.password;
  });

  it('creates an active admin with a hashed password', async () => {
    const { service, findOne, create } = build(null);
    expect(await service.seed()).toBe('created');

    expect(findOne).toHaveBeenCalledWith({ email: 'admin@travel.test' });
    const doc = create.mock.calls[0][0];
    expect(doc).toMatchObject({
      email: 'admin@travel.test',
      role: Role.Admin,
      status: 'active',
      mustChangePassword: false,
    });
    expect(doc.passwordHash).not.toBe(GOOD_PASSWORD);
    expect(await bcrypt.compare(GOOD_PASSWORD, doc.passwordHash)).toBe(true);
  });

  it('leaves an existing account untouched', async () => {
    const { service, create } = build({ role: Role.Admin });
    expect(await service.seed()).toBe('exists');
    expect(create).not.toHaveBeenCalled();
  });

  it('does not promote an existing non-admin account', async () => {
    const { service, create } = build({ role: Role.User });
    expect(await service.seed()).toBe('exists');
    expect(create).not.toHaveBeenCalled();
  });

  it('skips when the variables are missing', async () => {
    delete process.env.ADMIN_EMAIL;
    const { service, findOne, create } = build(null);
    expect(await service.seed()).toBe('skipped');
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('skips an invalid email', async () => {
    process.env.ADMIN_EMAIL = 'not-an-email';
    const { service, create } = build(null);
    expect(await service.seed()).toBe('skipped');
    expect(create).not.toHaveBeenCalled();
  });

  it('skips a weak password', async () => {
    process.env.ADMIN_PASSWORD = 'weak';
    const { service, create } = build(null);
    expect(await service.seed()).toBe('skipped');
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws on startup, even if the database fails', async () => {
    const { service, findOne } = build(null);
    findOne.mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
