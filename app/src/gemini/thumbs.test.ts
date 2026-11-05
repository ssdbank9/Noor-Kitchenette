import { describe, expect, it } from 'vitest';
import { boxToPixels } from './thumbs';

describe('boxToPixels', () => {
  it('maps a 0–1000 box into pixels with padding, clamped to the image', () => {
    // x: (200−40)/1000×1000 = 160, y: (100−40)/1000×500 = 30, x2: 640, y2: 170
    const r = boxToPixels([100, 200, 300, 600], 1000, 500);
    expect(r).toEqual({ x: 160, y: 30, w: 480, h: 140 });
  });
  it('clamps padding at the edges', () => {
    const r = boxToPixels([0, 0, 100, 100], 800, 800);
    expect(r).toEqual({ x: 0, y: 0, w: 112, h: 112 });
  });
  it('null box covers the whole image', () => {
    expect(boxToPixels(null, 640, 480)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });
  it('a degenerate image never yields zero-size rects', () => {
    expect(boxToPixels([0, 0, 1000, 1000], 0, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});
