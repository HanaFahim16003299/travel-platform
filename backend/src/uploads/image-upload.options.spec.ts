import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  imageUploadOptions,
  MAX_IMAGE_SIZE_BYTES,
} from './image-upload.options.js';

// Tests written by Mohamed Hesham for GEN-08: JPG or PNG only, 5 MB each.
describe('imageUploadOptions (GEN-08)', () => {
  const { fileFilter, limits } = imageUploadOptions();
  const check = (mimetype: string) => {
    const cb = vi.fn();
    fileFilter(undefined, { mimetype } as Express.Multer.File, cb);
    return cb.mock.calls[0];
  };

  it.each(['image/jpeg', 'image/png'])('accepts %s', (mimetype) => {
    expect(check(mimetype)).toEqual([null, true]);
  });

  it.each(['image/webp', 'image/gif', 'application/pdf'])(
    'rejects %s with a 400',
    (mimetype) => {
      const [error, accepted] = check(mimetype);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(accepted).toBe(false);
    },
  );

  it('limits each image to 5 MB', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(limits.fileSize).toBe(5 * 1024 * 1024);
  });
});
