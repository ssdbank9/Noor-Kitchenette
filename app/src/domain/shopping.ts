// The shopping list (F24, F33, F35, F36). The list is plain state: one line per ingredient,
// in base units, with the reason it is there and the dishes that need it. Adding the same
// ingredient again never makes a second line: dishes add up, a low-stock top-up and a dish
// take the larger need (buying both would double count what is already short).
import type { Availability } from './suggest';
import type { Balance } from './ledger';
import type { Ingredient } from './types';

export type ShopReason = 'dish' | 'low-stock';

export interface ShoppingItem {
  ingredientId: string;
  /** Base units to buy; null means "check": stock is not known, so no quantity is guessed. */
  amountBase: number | null;
  reason: ShopReason;
  recipeIds: string[];
}

export type ShoppingList = ShoppingItem[];

const EPS = 1e-9;

function merge(list: ShoppingList, add: ShoppingItem): ShoppingList {
  const found = list.find(i => i.ingredientId === add.ingredientId);
  if (!found) return [...list, { ...add, recipeIds: [...add.recipeIds] }];
  const recipeIds = [...new Set([...found.recipeIds, ...add.recipeIds])];
  const bothDish = found.reason === 'dish' && add.reason === 'dish';
  let amountBase: number | null;
  if (found.amountBase === null) amountBase = add.amountBase;
  else if (add.amountBase === null) amountBase = found.amountBase;
  else amountBase = bothDish ? found.amountBase + add.amountBase : Math.max(found.amountBase, add.amountBase);
  const reason: ShopReason = found.reason === 'dish' || add.reason === 'dish' ? 'dish' : 'low-stock';
  return list.map(i => (i.ingredientId === add.ingredientId ? { ingredientId: i.ingredientId, amountBase, reason, recipeIds } : i));
}

/** Adds what a dish is short of. The same dish added twice adds nothing the second time. */
export function addDishShortfall(list: ShoppingList, a: Availability): ShoppingList {
  let next = list;
  for (const n of a.needs) {
    if (n.optional) continue;
    let amount: number | null;
    if (n.status === 'short') amount = n.short;
    else if (n.status === 'maybe' || n.status === 'unconvertible') amount = null;
    else continue;
    const existing = next.find(i => i.ingredientId === n.ingredientId);
    if (existing?.recipeIds.includes(a.recipeId)) continue;
    next = merge(next, { ingredientId: n.ingredientId, amountBase: amount, reason: 'dish', recipeIds: [a.recipeId] });
  }
  return next;
}

/** Items below their minimum stock, topped up to the minimum; "not sure" stock becomes a check. */
export function lowStockTopUps(ingredients: Ingredient[], stock: Map<string, Balance>): ShoppingItem[] {
  const out: ShoppingItem[] = [];
  for (const ing of ingredients) {
    if (ing.minStock === undefined) continue;
    const b = stock.get(ing.id);
    const have = b ? b.amount : 0;
    if (have === null || b?.needsCheck) {
      out.push({ ingredientId: ing.id, amountBase: null, reason: 'low-stock', recipeIds: [] });
    } else if (ing.minStock - have > EPS) {
      out.push({ ingredientId: ing.id, amountBase: ing.minStock - have, reason: 'low-stock', recipeIds: [] });
    }
  }
  return out;
}

export function addLowStock(list: ShoppingList, ingredients: Ingredient[], stock: Map<string, Balance>): ShoppingList {
  return lowStockTopUps(ingredients, stock).reduce(merge, list);
}

export function removeItem(list: ShoppingList, ingredientId: string): ShoppingList {
  return list.filter(i => i.ingredientId !== ingredientId);
}

export interface AisleGroup {
  aisle: string;
  items: ShoppingItem[];
}

/** Aisles in the order they first appear in the ingredient list; items follow ingredient order. */
export function groupByAisle(list: ShoppingList, ingredients: Ingredient[]): AisleGroup[] {
  const order = new Map<string, number>();
  const aisleOrder: string[] = [];
  ingredients.forEach((ing, i) => {
    order.set(ing.id, i);
    if (!aisleOrder.includes(ing.aisle)) aisleOrder.push(ing.aisle);
  });
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of list) {
    const aisle = byId.get(item.ingredientId)?.aisle ?? 'Other';
    groups.set(aisle, [...(groups.get(aisle) ?? []), item]);
  }
  const sorted = (items: ShoppingItem[]) =>
    [...items].sort((a, b) => (order.get(a.ingredientId) ?? 1e9) - (order.get(b.ingredientId) ?? 1e9));
  const aisles = [...aisleOrder.filter(a => groups.has(a)), ...[...groups.keys()].filter(a => !aisleOrder.includes(a))];
  return aisles.map(aisle => ({ aisle, items: sorted(groups.get(aisle)!) }));
}

/** Plain text for sharing, grouped by aisle. */
export function shareText(list: ShoppingList, ingredients: Ingredient[], format: (base: number, ing: Ingredient) => string): string {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const lines = ['Shopping list'];
  for (const g of groupByAisle(list, ingredients)) {
    lines.push('', g.aisle);
    for (const item of g.items) {
      const ing = byId.get(item.ingredientId);
      const name = ing?.name ?? item.ingredientId;
      lines.push(`- ${name}${item.amountBase === null || !ing ? ' (check)' : ` ${format(item.amountBase, ing)}`}`);
    }
  }
  return lines.join('\n');
}
