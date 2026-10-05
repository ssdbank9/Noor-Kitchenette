import { describe, expect, it } from 'vitest';
import { refreshStarter } from './refreshStarter';
import type { KitchenData, Recipe } from '../domain/types';

const recipe = (id: string, extra: Partial<Recipe> = {}): Recipe =>
  ({ id, name: id, serves: 4, time: '1 hr', notes: '', version: 1, ingredients: [], ...extra });
const data = (recipes: Recipe[]): KitchenData => ({
  schemaVersion: 1, ingredients: [], recipes, events: [],
  settings: { householdName: 'x', timeZone: 'Asia/Karachi', defaultServings: 4, slotTimes: { breakfast: '08:00', lunch: '13:30', chai: '17:00', dinner: '20:30' } },
});

describe('refreshing starter recipes after an app update', () => {
  it('updates an unedited starter recipe with new fields (meals)', () => {
    const r = refreshStarter(data([recipe('R001')]), data([recipe('R001', { meals: ['lunch', 'dinner'] })]));
    expect(r.recipes.map(x => x.id)).toEqual(['R001']);
    expect(r.data.recipes[0].meals).toEqual(['lunch', 'dinner']);
  });

  it('never touches a recipe Noor edited (higher version) or her own recipes', () => {
    const saved = data([recipe('R001', { version: 2, notes: 'my way' }), recipe('P1', { personal: true })]);
    const r = refreshStarter(saved, data([recipe('R001', { meals: ['lunch'] }), recipe('P1', { meals: ['lunch'] })]));
    expect(r.recipes).toEqual([]);
    expect(r.data.recipes[0].notes).toBe('my way');
  });

  it('adds new starter recipes and changes nothing when already up to date', () => {
    const same = refreshStarter(data([recipe('R001')]), data([recipe('R001')]));
    expect(same.recipes).toEqual([]);
    const added = refreshStarter(data([recipe('R001')]), data([recipe('R001'), recipe('R021')]));
    expect(added.data.recipes.map(x => x.id)).toEqual(['R001', 'R021']);
  });
});
