import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

const NAME = 'My test dish';

async function openRecipes(page: Page) {
  await page.getByRole('button', { name: 'See all' }).click();
  await expect(page.getByRole('heading', { name: 'Recipes', level: 1 })).toBeVisible();
}

async function pickIngredient(page: Page, search: string, name: RegExp) {
  await page.getByRole('button', { name: '+ Add ingredient' }).click();
  await page.getByRole('searchbox', { name: 'Search ingredients' }).fill(search);
  await page.getByRole('button', { name }).first().click();
}

/** From the Recipes screen: add NAME with two ingredients and two steps, and save. */
async function addDish(page: Page, name = NAME) {
  await page.getByRole('button', { name: '+ Write my own' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: '30 min' }).click();
  await pickIngredient(page, 'egg', /^Eggs/);
  await page.getByRole('textbox', { name: 'Amount of Eggs' }).fill('3');
  await pickIngredient(page, 'basmati', /^Basmati Rice/);
  await page.getByRole('textbox', { name: 'Amount of Basmati Rice' }).fill('250');
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByRole('textbox', { name: 'Step 1' }).fill('Beat the eggs.');
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByRole('textbox', { name: 'Step 2' }).fill('Fry gently with the rice.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('add a dish, find it under My recipes, edit it, cook it, delete it: History keeps the name', async ({ page }) => {
  await openWithSamplePantry(page);
  await openRecipes(page);
  await addDish(page);

  // The recipe page shows the steps, numbered, and the amounts.
  await expect(page.getByRole('heading', { name: 'Steps' })).toBeVisible();
  await expect(page.locator('.own-method__list li')).toHaveText(['Beat the eggs.', 'Fry gently with the rice.']);
  await expect(page.getByText('250 g')).toBeVisible();
  await expect(page.getByText('30 min').first()).toBeVisible();

  // Under My recipes.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'My recipes', exact: true }).click();
  await expect(page.locator('.row__name', { hasText: NAME })).toBeVisible();
  await expect(page.locator('.row__name')).toHaveCount(1);
  await page.locator('.row__main', { hasText: NAME }).click();

  // Edit the name.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('My edited dish');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'My edited dish', level: 1 })).toBeVisible();
  await expect(page.getByText('Beat the eggs.')).toBeVisible();

  // Cook it with the yes word.
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved My edited dish' })).toBeVisible();

  // Delete it, behind a confirm that uses the yes/no words.
  await openRecipes(page);
  await page.getByRole('button', { name: 'My recipes', exact: true }).click();
  await page.locator('.row__main', { hasText: 'My edited dish' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete recipe' }).click();
  await expect(page.getByText('Your cooking history keeps its name.')).toBeVisible();
  await page.getByRole('button', { name: 'Nahi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete recipe' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete recipe' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recipes', level: 1 })).toBeVisible();
  await expect(page.locator('.row__name', { hasText: 'My edited dish' })).toHaveCount(0);

  // History still has the dish, under its own name.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.row__name', { hasText: 'My edited dish' })).toBeVisible();
  await expect(page.locator('.bar__name', { hasText: 'My edited dish' })).toBeVisible();
});

test('a saved dish is still there after a reload', async ({ page }) => {
  await openWithSamplePantry(page);
  await openRecipes(page);
  await addDish(page, 'Reload dish');
  await page.reload();
  await openRecipes(page);
  await page.getByRole('button', { name: 'My recipes', exact: true }).click();
  await page.locator('.row__main', { hasText: 'Reload dish' }).click();
  await expect(page.locator('.own-method__list li')).toHaveCount(2);
});

test('the ingredient search keeps focus while typing a whole word', async ({ page }) => {
  await openWithSamplePantry(page);
  await openRecipes(page);
  await page.getByRole('button', { name: '+ Write my own' }).click();
  await page.getByRole('button', { name: '+ Add ingredient' }).click();
  const search = page.getByRole('searchbox', { name: 'Search ingredients' });
  await expect(search).toBeFocused();
  await search.pressSequentially('masoor', { delay: 80 });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('masoor');
  await expect(page.getByRole('button', { name: /^Masoor Daal/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Chicken/ })).toHaveCount(0);
});

test('a new ingredient can be made from the picker and used in the dish', async ({ page }) => {
  await openWithSamplePantry(page);
  await openRecipes(page);
  await page.getByRole('button', { name: '+ Write my own' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Ajwain paratha');
  await page.getByRole('button', { name: '+ Add ingredient' }).click();
  await page.getByRole('searchbox', { name: 'Search ingredients' }).fill('ajwain');
  await page.getByRole('button', { name: 'Make "ajwain" a new ingredient' }).click();
  await page.getByRole('button', { name: 'g', exact: true }).click();
  await page.getByRole('button', { name: 'Spices/Masala' }).click();
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await expect(page.getByRole('textbox', { name: 'Amount of ajwain' })).toBeVisible();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Ajwain paratha', level: 1 })).toBeVisible();
  await expect(page.getByText('ajwain', { exact: true })).toBeVisible();
});

test('a dish with problems says what to fix and nothing is saved', async ({ page }) => {
  await openWithSamplePantry(page);
  await openRecipes(page);
  await page.getByRole('button', { name: '+ Write my own' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Give the dish a name.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Add at least one ingredient.' })).toBeVisible();
});

test('History: Week, Month and Year chips', async ({ page }) => {
  await openWithSamplePantry(page);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByText('in the last 7 days')).toBeVisible();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.getByText(`in ${new Date().getFullYear()}`)).toBeVisible();
});
