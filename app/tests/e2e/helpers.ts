import { expect, type Page } from '@playwright/test';

/** Opens the app and loads the sample pantry through Settings, then returns to Today (D-18). */
export async function openWithSamplePantry(page: Page): Promise<void> {
  await page.goto('/');
  await loadSamplePantry(page);
}

/** From Today: Settings, Load sample pantry, Back. */
export async function loadSamplePantry(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Load sample pantry' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sample pantry added' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: /let's cook/ })).toBeVisible();
}
