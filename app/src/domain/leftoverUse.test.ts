import { describe, expect, it } from 'vitest';
import { makeEvent } from './ledger';
import { applyLeftover, newLeftover } from './leftovers';
import { dueText, leftoverFromCook, leftoverIdForCook, leftoversUseSoon } from './leftoverUse';
import { upsertById } from './batches';

const cook = makeEvent('cook', [], new Date('2026-10-05T08:00:00Z'), { id: 'cook-1' });
const recipe = { id: 'R006b', name: 'Daal Mash' };

describe('leftovers from a cook event', () => {
  it('makes one leftover named for the dish, linked to the event', () => {
    const l = leftoverFromCook(cook, recipe, 2, 'fridge')!;
    expect(l).toMatchObject({ id: leftoverIdForCook('cook-1'), name: 'Daal Mash', recipeId: 'R006b', fromEventId: 'cook-1', portionsLeft: 2, madeOn: cook.localDate, location: 'fridge' });
  });
  it('makes none for zero portions', () => {
    expect(leftoverFromCook(cook, recipe, 0)).toBeNull();
  });
  it('is idempotent: saving the same cook again replaces, never duplicates', () => {
    const a = leftoverFromCook(cook, recipe, 2)!;
    const b = leftoverFromCook(cook, recipe, 2)!;
    expect(a).toEqual(b);
    expect(upsertById(upsertById([], a), b)).toHaveLength(1);
  });
  it('can start in the freezer', () => {
    expect(leftoverFromCook(cook, recipe, 3, 'freezer')).toMatchObject({ location: 'freezer', frozenOn: cook.localDate });
  });
});

describe('use soon leftovers', () => {
  const at = new Date('2026-10-05T10:00:00Z');
  const mk = (id: string, madeOn: string, loc: 'fridge' | 'freezer' = 'fridge') => newLeftover({ id, name: id, portions: 2, localDate: madeOn, at, location: loc });
  it('picks fridge leftovers whose guide is within 2 days or past, oldest first', () => {
    const list = [mk('fresh', '2026-10-05'), mk('due', '2026-10-03'), mk('late', '2026-09-30'), mk('frozen', '2026-09-20', 'freezer')];
    const out = leftoversUseSoon(list, '2026-10-05');
    expect(out.map(x => [x.leftover.id, x.useBy, x.daysLeft])).toEqual([['late', '2026-10-03', -2], ['due', '2026-10-06', 1]]);
  });
  it('skips finished ones and honours an explicit useBy', () => {
    const done = applyLeftover(mk('done', '2026-10-03'), { action: 'used', portions: 2, at, localDate: '2026-10-05' });
    expect(leftoversUseSoon([done], '2026-10-05')).toEqual([]);
    expect(leftoversUseSoon([{ ...mk('x', '2026-10-05'), useBy: '2026-10-07' }], '2026-10-05')).toHaveLength(1);
  });
  it('words', () => {
    expect([0, 1, 2, -1, -3].map(dueText)).toEqual(['today', 'tomorrow', 'in 2 days', '1 day ago', '3 days ago']);
  });
});
