import { expect, test } from '@playwright/test';

// F47: the Cooked tab can show a hand-picked range, in words Noor can read.
test('Cooked can show a picked date range, and it never goes backwards', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cooked', exact: true }).click();
  await page.getByRole('button', { name: 'Pick dates' }).click();

  const picker = page.locator('[aria-label="Pick dates"]');
  await picker.getByLabel('From').fill('2026-01-05');
  await picker.getByLabel('To').fill('2026-02-10');
  await expect(page.getByText('5 Jan 2026 to 10 Feb 2026')).toBeVisible();

  // Picking a start after the end pulls the end with it, so the range stays in order.
  await picker.getByLabel('From').fill('2026-03-01');
  await expect(page.getByText('1 Mar 2026', { exact: false })).toBeVisible();
  await expect(page.getByText('to 10 Feb 2026')).toHaveCount(0);
});
