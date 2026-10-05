// App updates can improve the starter recipes (fixes, meal suitability, better links).
// A saved copy that Noor never edited (same version, not her own recipe) is replaced by the
// bundled one; her own and edited recipes are never touched. New starter recipes and
// ingredients are added; nothing is ever removed.
import type { Ingredient, KitchenData, Recipe } from '../domain/types';

export interface StarterRefresh {
  data: KitchenData;
  recipes: Recipe[];
  ingredients: Ingredient[];
}

export function refreshStarter(saved: KitchenData, starter: KitchenData): StarterRefresh {
  const recipes: Recipe[] = [];
  const ingredients: Ingredient[] = [];
  const savedRecipes = new Map(saved.recipes.map(r => [r.id, r]));
  for (const fresh of starter.recipes) {
    const mine = savedRecipes.get(fresh.id);
    if (!mine || (!mine.personal && mine.version === fresh.version && JSON.stringify(mine) !== JSON.stringify(fresh))) {
      recipes.push(fresh);
    }
  }
  const savedIngredients = new Set(saved.ingredients.map(i => i.id));
  for (const fresh of starter.ingredients) if (!savedIngredients.has(fresh.id)) ingredients.push(fresh);

  const changed = new Map(recipes.map(r => [r.id, r]));
  const merged = [
    ...saved.recipes.map(r => changed.get(r.id) ?? r),
    ...recipes.filter(r => !savedRecipes.has(r.id)),
  ];
  return {
    data: { ...saved, recipes: merged, ingredients: [...saved.ingredients, ...ingredients] },
    recipes,
    ingredients,
  };
}
