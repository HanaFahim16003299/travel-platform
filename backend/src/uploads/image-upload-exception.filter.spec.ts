import { describe, expect, it, vi } from 'vitest';
import { PayloadTooLargeException } from '@nestjs/common';
import { ImageUploadExceptionFilter } from './image-upload-exception.filter.js';

// Test written by Mohamed Hesham for GEN-08.
describe('ImageUploadExceptionFilter', () => {
  it('answers a too-big image with 400 and a clear message', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    };

    new ImageUploadExceptionFilter().catch(
      new PayloadTooLargeException(),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'Image must be 5 MB or smaller',
      error: 'Bad Request',
    });
  });
});
