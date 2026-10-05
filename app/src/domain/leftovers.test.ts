import { describe, expect, it } from 'vitest';
import { addDaysTo, applyLeftover, newLeftover, stillHere, suggestedUseBy } from './leftovers';

const at = new Date('2026-10-05T10:00:00Z');
const made = () => newLeftover({ id: 'l1', name: 'Daal Mash', portions: 4, localDate: '2026-10-05', at, recipeId: 'R006b' });

describe('leftovers', () => {
  it('start with every portion left and a "made" log entry', () => {
    const l = made();
    expect(l).toMatchObject({ portionsMade: 4, portionsLeft: 4, location: 'fridge', madeOn: '2026-10-05' });
    expect(l.log).toEqual([{ at: at.toISOString(), localDate: '2026-10-05', kind: 'made', portions: 4 }]);
  });

  it('eating or throwing away reduces portions, never below zero, and logs it', () => {
    const l = made();
    const ate = applyLeftover(l, { action: 'used', portions: 3, at, localDate: '2026-10-06' });
    expect(ate.portionsLeft).toBe(1);
    expect(l.portionsLeft).toBe(4); // the original is untouched
    const over = applyLeftover(ate, { action: 'wasted', portions: 9, at, localDate: '2026-10-07' });
    expect(over.portionsLeft).toBe(0);
    expect(over.log.map(e => [e.kind, e.portions])).toEqual([['made', 4], ['used', 3], ['wasted', 1]]);
    expect(applyLeftover(over, { action: 'used', portions: 1, at, localDate: '2026-10-08' })).toBe(over);
  });

  it('freezing moves it to the freezer and records the date', () => {
    const frozen = applyLeftover(made(), { action: 'frozen', at, localDate: '2026-10-06' });
    expect(frozen).toMatchObject({ location: 'freezer', frozenOn: '2026-10-06' });
    expect(frozen.log.at(-1)).toMatchObject({ kind: 'frozen', portions: 4 });
  });

  it('moving to the same place changes nothing', () => {
    const l = made();
    expect(applyLeftover(l, { action: 'moved', location: 'fridge', at, localDate: '2026-10-06' })).toBe(l);
    expect(applyLeftover(l, { action: 'moved', location: 'shelf', at, localDate: '2026-10-06' }).location).toBe('shelf');
  });

  it('suggests a use-by guide from where it is kept, but an explicit date wins', () => {
    expect(suggestedUseBy(made())).toBe('2026-10-08');
    const frozen = applyLeftover(made(), { action: 'frozen', at, localDate: '2026-10-06' });
    expect(suggestedUseBy(frozen)).toBe('2027-01-04');
    expect(suggestedUseBy({ ...made(), useBy: '2026-10-10' })).toBe('2026-10-10');
  });

  it('adds days across month boundaries and lists only leftovers with portions', () => {
    expect(addDaysTo('2026-10-30', 3)).toBe('2026-11-02');
    const gone = applyLeftover(made(), { action: 'used', portions: 4, at, localDate: '2026-10-06' });
    expect(stillHere([made(), gone])).toHaveLength(1);
  });
});
