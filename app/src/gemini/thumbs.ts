// Per-item thumbnails for the Snap review: crop the photo the model just read to the box it
// reported, so each card shows WHAT it is asking about. Crops live only in memory, same as the
// photo itself (D-20) — nothing here is persisted.
import type { PreparedImage } from './photo';

export interface Pixels { x: number; y: number; w: number; h: number }

const THUMB_SIDE = 160;
/** Padding around the box so the crop breathes a little, in 0–1000 space. */
const PAD = 40;

/** A 0–1000 box to pixel rect in an image of w x h. Null box covers the whole image. */
export function boxToPixels(box: [number, number, number, number] | null, w: number, h: number): Pixels {
  if (!box || w <= 0 || h <= 0) return { x: 0, y: 0, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  const [ymin, xmin, ymax, xmax] = box;
  const x0 = Math.max(0, Math.floor(((xmin - PAD) / 1000) * w));
  const y0 = Math.max(0, Math.floor(((ymin - PAD) / 1000) * h));
  // The epsilon keeps float noise (112.00000000000001) from inflating the crop by a pixel.
  const x1 = Math.min(w, Math.ceil(((xmax + PAD) / 1000) * w - 1e-9));
  const y1 = Math.min(h, Math.ceil(((ymax + PAD) / 1000) * h - 1e-9));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * Crops the prepared photo to the item's box as a small JPEG data URL. Null when the image
 * cannot be decoded — the card then just shows the label. Never throws.
 */
export async function cropThumb(image: PreparedImage, box: [number, number, number, number] | null): Promise<string | null> {
  try {
    const blob = await (await fetch(`data:${image.mimeType};base64,${image.data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const r = boxToPixels(box, bitmap.width, bitmap.height);
      const scale = Math.min(1, THUMB_SIDE / Math.max(r.w, r.h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(r.w * scale));
      canvas.height = Math.max(1, Math.round(r.h * scale));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
      if (!out) return null;
      return await new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(out);
      });
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}
