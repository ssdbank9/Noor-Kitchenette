import { expect, test } from '@playwright/test';

// F44, D6: a cooked meal must still be in History after the page is reloaded.
test('a cooked meal is still in History after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /let's cook/ }).click();
  const name = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText(`Saved ${name}`);
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await page.getByRole('button', { name: 'History', exact: true }).click();
  const countBefore = await page.getByText(name).count();
  expect(countBefore).toBeGreaterThan(0);

  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  expect(await page.getByText(name).count()).toBe(countBefore);
  await expect(page.locator('.save-banner')).toHaveCount(0);
});
