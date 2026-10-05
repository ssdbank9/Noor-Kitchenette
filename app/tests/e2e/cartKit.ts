import type { Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { basketFromPlan } from '../../src/domain/basket';
import { cartLines, type CartLine } from '../../src/domain/cart';
import { balances } from '../../src/domain/ledger';
import { defaultShopPrefs } from '../../src/domain/shopPrefs';
import type { ShoppingList } from '../../src/domain/shopping';
import { toBase } from '../../src/domain/units';
import type { KitchenEvent, PlannedMeal, ShopPrefs } from '../../src/domain/types';

/** The fixed "today" tests that care about dates run at: Monday 5 October 2026, Karachi. */
export const TODAY = '2026-10-05';

/** The cart the app should show for these inputs, worked out by the same domain code the app uses. */
export function cartOf(o: { plan?: PlannedMeal[]; events?: KitchenEvent[]; manual?: ShoppingList; prefs?: ShopPrefs; today?: string } = {}): CartLine[] {
  const events = o.events ?? demoPantry;
  const today = o.today ?? TODAY;
  const stock = balances(events);
  return cartLines({
    manual: o.manual ?? [],
    basket: basketFromPlan(o.plan ?? [], seed.recipes, stock, seed.ingredients, toBase, today, events),
    ingredients: seed.ingredients,
    stock,
    today,
    prefs: o.prefs ?? defaultShopPrefs(),
  });
}

/** One cart line on the Shop tab, found by its "Got it" button. */
export const cartRow = (page: Page, name: string) =>
  page.locator('.shop-item').filter({ has: page.getByRole('button', { name: `Got it: ${name}`, exact: true }) });
