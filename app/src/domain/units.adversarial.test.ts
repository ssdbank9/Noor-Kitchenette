import { describe, expect, it } from 'vitest';
import { toBase } from './units';
import { buildPantryEvent } from './pantryActions';
import { testKitchen } from '../storage/testKitchen';

describe('independent adversarial regressions: amount bounds', () => {
  it('AR13: a finite input whose converted weight overflows is refused before it reaches stock', () => {
    const rice = testKitchen().ingredients[0];
    const converted = toBase(1e308, 'kg', rice);
    const purchase = buildPantryEvent({ action: 'bought', ingredient: rice, amount: 1e308, unit: 'kg',
      instant: new Date('2026-10-05T10:00:00+05:00') });
    expect([converted.ok, purchase.ok]).toEqual([false, false]);
  });
});
