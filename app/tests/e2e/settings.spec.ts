import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadSamplePantry } from './helpers';

const openSettings = (page: Page) => page.getByRole('button', { name: 'Settings', exact: true }).click();
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true }).click();

async function downloadBackup(page: Page): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save a copy of everything' }).click(),
  ]);
  return { name: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') };
}

test('a fresh start shows the empty pantry, not sample stock', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Your pantry is empty.')).toBeVisible();
  await expect(page.getByText('Take a photo of your food, or add things one by one.')).toBeVisible();
  await expect(page.getByRole('button', { name: /let's cook/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Pantry' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.locator('.pantry-item__amount').first()).toHaveText('none');
});

test('loading the sample pantry from the empty state makes Today suggest a dish, and it can be removed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try practice food' }).click();
  await expect(page.getByRole('button', { name: /let's cook/ })).toBeVisible();
  await expect(page.getByText('Your pantry is empty.')).toHaveCount(0);

  await openSettings(page);
  await page.getByRole('button', { name: 'Remove practice food' }).click();
  await expect(page.getByRole('button', { name: 'Remove practice food' })).toBeDisabled();
  await back(page);
  await expect(page.getByText('Your pantry is empty.')).toBeVisible();
});

test('Undo on the sample pantry toast takes it back out', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('button', { name: 'Load practice food' }).click();
  await page.getByRole('status').filter({ hasText: 'Sample pantry added' }).getByRole('button', { name: 'Undo' }).click();
  await back(page);
  await expect(page.getByText('Your pantry is empty.')).toBeVisible();
});

test('switching to Yes / No changes the cooking question buttons', async ({ page }) => {
  await page.goto('/');
  await loadSamplePantry(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'Yes / No', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yes / No', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await back(page);
  await expect(page.getByRole('button', { name: "Yes, let's cook" })).toBeVisible();
  await page.getByRole('button', { name: /let's cook/ }).click();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Haan', exact: true })).toHaveCount(0);

  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Yes / No', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the Gemini key survives a reload and is not in the backup file', async ({ page }) => {
  const secret = 'AIzaSy-test-key-1234567890';
  await page.goto('/');
  await openSettings(page);
  const input = page.getByRole('textbox', { name: 'Gemini key' });
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill(secret);
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('Key saved on this phone.')).toBeVisible();
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('textbox', { name: 'Gemini key' })).toHaveAttribute('placeholder', 'A key is saved');
  await expect(page.getByRole('button', { name: 'Remove key' })).toBeEnabled();

  const { name, text } = await downloadBackup(page);
  expect(name).toMatch(/^noors-kitchen-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(text).not.toContain(secret);
  expect(text).not.toMatch(/gemini/i);
  expect(JSON.parse(text).app).toBe('noors-kitchen');

  await page.getByRole('button', { name: 'Remove key' }).click();
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('textbox', { name: 'Gemini key' })).toHaveAttribute('placeholder', 'Paste your key');
});

test('a meal time change and the people count persist across a reload', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await expect(page.locator('output[aria-label="Breakfast time"]')).toHaveText('8:00 am');
  await page.getByRole('button', { name: 'Breakfast 15 minutes later' }).click();
  await page.getByRole('button', { name: 'Breakfast 15 minutes later' }).click();
  await page.getByRole('button', { name: 'Dinner 15 minutes earlier' }).click();
  await page.getByRole('button', { name: 'More people usually eating' }).click();
  await expect(page.locator('output[aria-label="Breakfast time"]')).toHaveText('8:30 am');
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await page.reload();
  await openSettings(page);
  await expect(page.locator('output[aria-label="Breakfast time"]')).toHaveText('8:30 am');
  await expect(page.locator('output[aria-label="Dinner time"]')).toHaveText('8:15 pm');
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('5');
});

test('restoring a malformed file shows an error and changes nothing', async ({ page }) => {
  await page.goto('/');
  await loadSamplePantry(page);
  await openSettings(page);
  await page.getByLabel('Backup file').setInputFiles({
    name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"noors-kitchen","schemaVersion":1,"events":"nope"}'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'could not be used' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await page.getByLabel('Backup file').setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('not json at all') });
  await expect(page.getByRole('alert')).toContainText('not valid JSON');

  await back(page);
  await expect(page.getByRole('button', { name: /let's cook/ })).toBeVisible();
  await expect(page.getByText('Your pantry is empty.')).toHaveCount(0);
});

test('restoring a good backup asks first, then replaces the kitchen', async ({ page }) => {
  await page.goto('/');
  await loadSamplePantry(page);
  await openSettings(page);
  const { text } = await downloadBackup(page);

  await page.getByRole('button', { name: 'Remove practice food' }).click();
  await page.getByLabel('Backup file').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('removes what is here now');

  // Nahi cancels.
  await confirm.getByRole('button', { name: 'Nahi', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await back(page);
  await expect(page.getByText('Your pantry is empty.')).toBeVisible();

  await openSettings(page);
  await page.getByLabel('Backup file').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(page.getByText('Done. This phone now has the saved copy.')).toBeVisible();
  await back(page);
  await expect(page.getByRole('button', { name: /let's cook/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /let's cook/ })).toBeVisible();
});

test('Test search says it works when the search model returns a page', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const photo = page.getByRole('region', { name: 'Who reads the photos?' });
  await page.getByRole('button', { name: 'Command Code', exact: true }).click();
  await photo.getByRole('textbox', { name: 'Command Code secret key' }).fill('cc-fake-key-0001');
  await photo.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('Command Code key saved on this phone.')).toBeVisible();

  await page.route('https://api.commandcode.ai/provider/v1/responses', route => route.fulfill({
    json: {
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'Found one page.',
          annotations: [{ type: 'url_citation', url: 'https://example.pk/aloo-gosht', title: 'Aloo Gosht' }],
        }],
      }],
    },
  }));
  await page.getByRole('button', { name: 'Test search' }).click();
  await expect(page.getByText('Search works (1 page found).')).toBeVisible();
});
