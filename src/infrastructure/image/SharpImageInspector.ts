import sharp from 'sharp';
import type { ImageInspector, ImageSize } from '@/application/services/ImageInspector';
import { loadImageBuffer } from './loadImageBuffer';

export class SharpImageInspector implements ImageInspector {
  async size(imageUrl: string): Promise<ImageSize | null> {
    try {
      const { width, height } = await sharp(await loadImageBuffer(imageUrl)).metadata();
      return width && height ? { width, height } : null;
    } catch {
      return null;
    }
  }
}
