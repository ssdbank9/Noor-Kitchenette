import { describe, expect, it } from 'vitest';
import { balances, makeEvent } from './ledger';

describe('independent adversarial regressions: ledger', () => {
  it('AR03: two stock checks recorded in the same millisecond preserve the newer check', () => {
    const instant = new Date('2026-10-05T18:59:59.000Z');
    const first = makeEvent('set-stock', [{ ingredientId: 'Eggs', delta: 0, setTo: 5, basis: 'measured' }], instant, { id: 'z-first' });
    const second = makeEvent('set-stock', [{ ingredientId: 'Eggs', delta: 0, setTo: 2, basis: 'measured' }], instant, { id: 'a-second' });
    expect(balances([first, second]).get('Eggs')?.amount).toBe(2);
  });
});
