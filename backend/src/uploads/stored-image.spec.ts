import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteStoredImage } from './stored-image.js';

// Tests written by Mohamed Hesham for GEN-08 (the helper moved here from blog).
describe('deleteStoredImage', () => {
  let dir: string;
  const previousDir = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uploads-'));
    process.env.UPLOAD_DIR = dir;
  });

  afterEach(async () => {
    if (previousDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  });

  it('deletes a stored image', async () => {
    await writeFile(join(dir, 'a.jpg'), 'x');

    await deleteStoredImage('a.jpg');

    expect(existsSync(join(dir, 'a.jpg'))).toBe(false);
  });

  it('does nothing when the file is already gone', async () => {
    await expect(deleteStoredImage('missing.jpg')).resolves.toBeUndefined();
  });

  it('rejects a name that points outside the upload folder', async () => {
    await expect(deleteStoredImage('../outside.jpg')).rejects.toThrow(
      BadRequestException,
    );
  });
});
