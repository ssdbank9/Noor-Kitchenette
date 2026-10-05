import { describe, expect, it } from 'vitest';
import { canUpdateNow } from './canUpdateNow';

describe('canUpdateNow', () => {
  it('allows an update when nothing is pending', () => {
    expect(canUpdateNow({ status: 'idle', pending: 0 })).toBe(true);
  });
  it('waits while a save is running', () => {
    expect(canUpdateNow({ status: 'saving', pending: 1 })).toBe(false);
  });
  it('blocks when a save failed', () => {
    expect(canUpdateNow({ status: 'error', pending: 2 })).toBe(false);
  });
  it('blocks on an error state even with nothing counted', () => {
    expect(canUpdateNow({ status: 'error', pending: 0 })).toBe(false);
  });
});
