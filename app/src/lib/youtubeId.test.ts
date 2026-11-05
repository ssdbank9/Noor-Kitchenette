import { describe, expect, it } from 'vitest';
import { youtubeId } from './youtubeId';

describe('youtubeId', () => {
  it('reads watch, youtu.be, shorts and embed links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ?start=30')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s')).toBe('dQw4w9WgXcQ');
  });
  it('returns null for junk, other sites and empty input', () => {
    expect(youtubeId(null)).toBeNull();
    expect(youtubeId('')).toBeNull();
    expect(youtubeId('not a url')).toBeNull();
    expect(youtubeId('https://www.foodpanda.pk/restaurant/abc')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?list=PL123')).toBeNull();
    expect(youtubeId('https://youtu.be/')).toBeNull();
  });
});
