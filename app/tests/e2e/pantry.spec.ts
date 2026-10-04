import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, name: string) =>
  page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });

async function openPantry(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
}

/** The number in a row's amount text, e.g. "10 pc · not confirmed" -> 10. */
async function pieces(page: Page, name: string): Promise<number> {
  const text = await row(page, name).locator('.pantry-item__amount').innerText();
  return Number(/(\d+(?:\.\d+)?) pc/.exec(text)![1]);
}

test('search keeps focus while typing and filters to Tomato', async ({ page }) => {
  await openPantry(page);
  const search = page.getByRole('searchbox', { name: 'Search pantry' });
  await search.click();
  await page.keyboard.type('tom');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('tom');
  await expect(row(page, 'Tomato')).toBeVisible();
  await expect(row(page, 'Potato')).toHaveCount(0);
});

test('search focus regression: a full word stays in the box and focused', async ({ page }) => {
  await openPantry(page);
  const search = page.getByRole('searchbox', { name: 'Search pantry' });
  await search.click();
  await page.keyboard.type('tomato', { delay: 40 });
  await expect(search).toHaveValue('tomato');
  await expect(search).toBeFocused();
});

test('Bought more 6 pc of Tomato adds 6, and Undo restores it', async ({ page }) => {
  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Bought more' }).click();
  await page.getByRole('button', { name: '6 pc', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row(page, 'Tomato')).toContainText(`${before + 6} pc`);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Tomato')).toContainText(`${before} pc`);
});

test("Checked what's left sets 2 pc, confirmed", async ({ page }) => {
  await openPantry(page);
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: "Checked what's left" }).click();
  await page.getByLabel('Exact amount').fill('2');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row(page, 'Tomato')).toContainText('2 pc');
  await expect(row(page, 'Tomato')).not.toContainText('not confirmed');
});

test('Not sure shows not sure, not zero', async ({ page }) => {
  await openPantry(page);
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: "Checked what's left" }).click();
  await page.getByRole('button', { name: 'Not sure', exact: true }).click();
  await expect(row(page, 'Tomato')).toContainText('not sure');
});

test('Finished shows none left, and the Low chip then lists it', async ({ page }) => {
  await openPantry(page);
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Finished', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row(page, 'Tomato')).toContainText('0 pc');
  await page.getByRole('button', { name: 'Low', exact: true }).click();
  await expect(row(page, 'Tomato')).toContainText('Low');
});

test('an unusable amount is refused with a message', async ({ page }) => {
  await openPantry(page);
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Used some' }).click();
  await page.getByLabel('Exact amount').fill('-2');
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
});
