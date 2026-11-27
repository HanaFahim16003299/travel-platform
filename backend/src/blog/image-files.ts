import { deleteStoredImage } from '../uploads/stored-image.js';
import type { PostImage } from './schemas/post.schema.js';

export async function deletePostImages(images: readonly PostImage[]) {
  await Promise.all(images.map((image) => deleteStoredImage(image.filename)));
}
