import { describe, expect, it } from 'vitest';
import { formFromRecipe, recipeFromForm } from './recipeForm';
import { testKitchen } from '../storage/testKitchen';

describe('independent adversarial regressions: recipe editing', () => {
  it('AR10: changing only a recipe name preserves optional ingredients', () => {
    const kitchen = testKitchen();
    const recipe = { ...kitchen.recipes[1], ingredients: [
      ...kitchen.recipes[1].ingredients.map(line => ({ ...line, optional: true })),
    ] };
    const form = formFromRecipe(recipe);
    form.name = 'Renamed paratha';
    const saved = recipeFromForm(form, recipe, { ingredients: kitchen.ingredients });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.recipe.ingredients[0].optional).toBe(true);
  });
});
