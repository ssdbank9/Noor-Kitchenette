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

/**
 * Saves a fake Gemini key through Settings, then returns to Today. Tests that use Gemini
 * must also intercept the network (page.route on https://generativelanguage.googleapis.com/**)
 * so no real request is ever sent.
 */
export async function saveFakeGeminiKey(page: Page, key = 'AIzaFAKE-test-key-0000000000'): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Gemini key' }).fill(key);
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('Key saved on this phone.')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
}
