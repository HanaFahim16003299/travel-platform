import { BadRequestException } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { uploadDir } from '../uploads/image-upload.options.js';
import type { PostImage } from './schemas/post.schema.js';

function storedImagePath(filename: string) {
  const root = resolve(uploadDir());
  const filePath = resolve(root, filename);
  if (basename(filename) !== filename || dirname(filePath) !== root)
    throw new BadRequestException('Invalid stored image filename');
  return filePath;
}

export async function deleteStoredImage(filename: string) {
  try {
    await unlink(storedImagePath(filename));
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return;
    throw error;
  }
}

export async function deletePostImages(images: readonly PostImage[]) {
  await Promise.all(images.map((image) => deleteStoredImage(image.filename)));
}
