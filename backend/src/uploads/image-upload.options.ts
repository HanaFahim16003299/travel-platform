import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import multer from 'multer';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

// GEN-08: JPG and PNG only, at most 5 MB per image.
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? 'uploads';
}

export function imageUploadOptions() {
  return {
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = uploadDir();
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${EXTENSIONS[file.mimetype] ?? ''}`);
      },
    }),
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (!(file.mimetype in EXTENSIONS)) {
        return cb(new BadRequestException('Only JPEG and PNG images are allowed'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  };
}
