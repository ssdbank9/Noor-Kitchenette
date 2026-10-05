import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// D-23: Aly pays for a foodpanda order; Noor logs the cost and pays back all or half.
test.use({ serviceWorkers: 'block' });

async function start(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00+05:00'));
  await openWithSamplePantry(page);
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
}

test('log an order, pay back half, mark paid, and it all survives a reload', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Log an order' }).click();
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page.getByRole('alert')).toContainText('restaurant');
  await page.getByLabel('Restaurant').fill('Burger Lab');
  await page.getByLabel('What it cost (Rs)').fill('2,401');
  await page.getByRole('button', { name: 'Save order' }).click();
  const card = page.getByRole('article', { name: 'Order Burger Lab' });
  await expect(card).toContainText('Rs 2,401');
  await expect(card.getByRole('button', { name: /Pay back all/ })).toBeVisible();
  await card.getByRole('button', { name: /Pay back half/ }).click();
  await expect(card).toContainText('Paying back Rs 1,201 (half)');
  await expect(page.getByText('To pay back to Aly:')).toContainText('Rs 1,201');

  await page.reload();
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  const again = page.getByRole('article', { name: 'Order Burger Lab' });
  await expect(again).toContainText('Paying back Rs 1,201 (half)');
  await again.getByRole('button', { name: /^Paid/ }).click();
  await expect(again).toContainText('Paid back Rs 1,201 on 2026-10-05');
  await expect(page.getByText('To pay back to Aly:')).toHaveCount(0);
  await expect(page.getByText('Paid back so far: Rs 1,201')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  await expect(page.getByRole('article', { name: 'Order Burger Lab' })).toContainText('Paid back Rs 1,201'); // the log is kept
});
