import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup } from './backup';
import { openKitchenDb, replaceAll, saveShopping, loadShopping, type KitchenDb } from './db';
import { testKitchen } from './testKitchen';
import { withoutRecipe } from '../domain/recipeForm';

const opened: KitchenDb[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

describe('independent adversarial regressions: storage', () => {
  it('AR01: a backup remains restorable after a cooked personal recipe is deleted', () => {
    const kitchen = testKitchen();
    kitchen.events = kitchen.events.slice(0, 2);
    kitchen.events[1].movements = [{ ingredientId: 'Eggs', delta: -2, basis: 'measured' }];
    kitchen.events[1].meal = {
      recipeId: 'R002', recipeName: 'Anda paratha', recipeVersion: 1,
      slot: 'lunch', servings: 2, rating: 'loved',
    };
    const deleted = withoutRecipe(kitchen, 'R002');
    const parsed = parseBackup(exportBackup(deleted));
    expect(parsed, 'History keeps the dish name after deletion; the same kitchen must restore.').toMatchObject({ ok: true });
  });

  it('AR02: restoring a kitchen clears the previous manual shopping list durably', async () => {
    const db = await openKitchenDb('independent-review-restore-cart');
    opened.push(db);
    await replaceAll(db, testKitchen());
    await saveShopping(db, [{ ingredientId: 'Eggs', amountBase: 6, reason: 'dish', recipeIds: [] }]);
    expect((await restoreBackup(db, exportBackup(testKitchen()))).ok).toBe(true);
    expect(await loadShopping(db), 'Restore clears this list in App state; reopening must not resurrect it.').toEqual([]);
  });

  it('AR11: backup validation rejects a half repayment inconsistent with the order cost', () => {
    const kitchen = testKitchen();
    kitchen.orderCosts = [{ id: 'order-1', place: 'Test restaurant', amount: 2401,
      localDate: '2026-10-05', repay: { option: 'half', amount: 1 } }];
    expect(parseBackup(exportBackup(kitchen)).ok).toBe(false);
  });
});
