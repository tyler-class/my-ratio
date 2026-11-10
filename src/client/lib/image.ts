// Phones take 12-megapixel photos; a bag shot doesn't need that. Downscale before upload.

const MAX_EDGE = 1600;

export interface Prepared {
  blob: Blob;
  width: number;
  height: number;
  filename: string;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That file could not be read as an image.');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  // PNG/WebP/GIF keep transparency (logos); photos become JPEG.
  const keepAlpha = /png|webp|gif/.test(file.type);
  if (scale === 1 && file.size < 1_500_000 && /jpeg|png|webp/.test(file.type)) {
    bitmap.close();
    return { blob: file, width, height, filename: file.name };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = keepAlpha
    ? await toBlob(canvas, 'image/png')
    : await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error('That image could not be processed.');
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return { blob, width, height, filename: `${base}.${keepAlpha ? 'png' : 'jpg'}` };
}
