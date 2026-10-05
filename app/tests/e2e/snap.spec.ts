// Snap pantry (F52). Gemini is NEVER called for real: every request to Google is answered here.
import { expect, test, type Page, type Route } from '@playwright/test';
import { openWithSamplePantry, saveFakeGeminiKey } from './helpers';

const GEMINI = 'https://generativelanguage.googleapis.com/**';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const photo = { name: 'shelf.png', mimeType: 'image/png', buffer: PNG };

type Item = Record<string, unknown>;
const answer = (items: Item[], note = '') => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ items, note }) }] }, finishReason: 'STOP' }],
});

/** Answers each Gemini request with the next canned reply; returns how many were made. */
async function mockGemini(page: Page, replies: ((route: Route) => Promise<void>)[]) {
  const state = { calls: 0, bodies: [] as string[] };
  await page.route(GEMINI, async route => {
    state.bodies.push(route.request().postData() ?? '');
    const reply = replies[Math.min(state.calls, replies.length - 1)];
    state.calls++;
    await reply(route);
  });
  return state;
}
const json = (body: unknown, status = 200) => (route: Route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const offline = (route: Route) => route.abort('internetdisconnected');

const row = (page: Page, name: string) =>
  page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });
const amountText = (page: Page, name: string) => row(page, name).locator('.pantry-item__amount').innerText();
async function pieces(page: Page, name: string): Promise<number> {
  return Number(/(\d+(?:\.\d+)?) pc/.exec(await amountText(page, name))![1]);
}
async function openPantry(page: Page) {
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
}
async function startSnap(page: Page, kind: 'New groceries' | 'Shopping receipt' | 'Check my pantry or fridge') {
  await page.getByRole('button', { name: 'Snap pantry' }).click();
  await page.getByRole('button', { name: kind }).click();
}
const pickPhoto = (page: Page) => page.getByLabel('Photo from gallery').setInputFiles(photo);
const save = (page: Page) => page.getByRole('button', { name: /^Save \d/ });

test('groceries photo: review, save, Pantry goes up once; unsure line starts off', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  const mock = await mockGemini(page, [json(answer([
    { label: 'Tomatoes', count: 6, certainty: 'sure' },
    { label: 'Mystery bag', count: 1, certainty: 'unsure' },
  ]))]);
  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await page.getByRole('button', { name: 'Today', exact: true }).click();

  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  expect(mock.calls).toBe(1);
  expect(mock.bodies[0]).toContain('inlineData');

  await expect(page.getByText('Not sure', { exact: true })).toBeVisible();
  await expect(page.getByText('Check this', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pick which of yours this is' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include Mystery bag' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include Tomatoes' })).toBeChecked();
  await expect(page.getByLabel('Stock of Tomato')).toContainText(`${before} pc`);
  await expect(page.getByLabel('Stock of Tomato')).toContainText(`${before + 6} pc`);
  await expect(page.getByText('1 of 2 lines are on')).toBeVisible();

  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pantry updated' })).toBeVisible();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before + 6);

});

test('Undo right after saving puts stock back', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Tomatoes', count: 6, certainty: 'sure' }]))]);
  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await save(page).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before);
});

test('double-tapping Save changes stock once', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Tomatoes', count: 6, certainty: 'sure' }]))]);
  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await save(page).dblclick();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before + 6);
});

test('receipt and groceries of the same shop merge into one line and stock rises once', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [
    json(answer([{ label: 'Basmati Rice', count: 1, packageSize: { amount: 5, unit: 'kg' }, certainty: 'sure' }])),
    json(answer([{ label: 'Basmati Rice 5kg', count: 1, packageSize: { amount: 5, unit: 'kg' }, priceRs: 1400, certainty: 'sure' }])),
  ]);
  await openPantry(page);
  const before = await amountText(page, 'Basmati Rice');
  await page.getByRole('button', { name: 'Today', exact: true }).click();

  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  await page.getByRole('button', { name: 'Add another photo' }).click();
  await page.getByRole('button', { name: 'Shopping receipt' }).click();
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Same shopping trip?' })).toBeVisible();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();

  await expect(page.locator('.snapline')).toHaveCount(1);
  await expect(page.getByText('Seen in both photos')).toBeVisible();
  await expect(page.getByText('Receipt: Rs 1400')).toBeVisible();
  await expect(page.getByLabel('Amount of Basmati Rice')).toHaveValue('5');
  await save(page).click();

  await openPantry(page);
  const after = await amountText(page, 'Basmati Rice');
  const kg = (t: string) => { const m = /(\d+(?:\.\d+)?) (kg|g)/.exec(t); return m ? Number(m[1]) * (m[2] === 'kg' ? 1000 : 1) : 0; };
  expect(kg(after) - kg(before)).toBe(5000);
});

test('a pantry photo with a "5 kg" package label does not set the remaining amount', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Basmati Rice', count: 1, packageSize: { amount: 5, unit: 'kg' }, certainty: 'sure' }]))]);
  await openPantry(page);
  const before = await amountText(page, 'Basmati Rice');
  await page.getByRole('button', { name: 'Today', exact: true }).click();

  await startSnap(page, 'Check my pantry or fridge');
  await pickPhoto(page);
  await expect(page.getByText('Package says 5 kg')).toBeVisible();
  await expect(page.getByText('How much is left?').first()).toBeVisible();
  await expect(page.getByLabel('Amount of Basmati Rice')).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: 'Include Basmati Rice' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: /^Save 0/ })).toBeDisabled();

  await page.getByLabel('Amount of Basmati Rice').fill('1.5');
  await expect(page.getByRole('checkbox', { name: 'Include Basmati Rice' })).toBeChecked();
  await save(page).click();
  await openPantry(page);
  const after = await amountText(page, 'Basmati Rice');
  expect(after).toContain('1.5 kg');
  expect(after).not.toContain('not confirmed');
  expect(after).not.toBe(before);
});

test('no key: friendly prompt, and the typed list still works', async ({ page }) => {
  await openWithSamplePantry(page);
  const mock = await mockGemini(page, [offline]);
  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await page.getByRole('button', { name: 'Today', exact: true }).click();

  await startSnap(page, 'New groceries');
  await expect(page.getByText('Reading photos needs your Gemini key')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take photo' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Type a list instead' }).click();
  await page.getByRole('textbox', { name: 'Your list' }).fill('Tomatoes 4\nPyaz 2 kg');
  await page.getByRole('button', { name: 'Check my list' }).click();
  await expect(page.getByText('1 of 2 lines are on')).toBeVisible();
  await save(page).click();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before + 4);
  expect(mock.calls).toBe(0);
});

test('a dropped network shows a plain message and the typed list still works', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [offline]);
  await startSnap(page, 'Shopping receipt');
  await pickPhoto(page);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No internet connection');
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
  await alert.getByRole('button', { name: 'Type a list instead' }).click();
  await page.getByRole('textbox', { name: 'Your list' }).fill('Onion 3');
  await page.getByRole('button', { name: 'Check my list' }).click();
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include Onion' })).toBeChecked();
});

test('Settings: Test my key shows "Key works" and the plain error', async ({ page }) => {
  await page.goto('/');
  await mockGemini(page, [
    json({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }),
    json({ error: { message: 'API key not valid' } }, 403),
  ]);
  await saveFakeGeminiKey(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Photos are sent to Google to be read and are not saved in the app.')).toBeVisible();
  await page.getByRole('button', { name: 'Test my key' }).click();
  await expect(page.getByText('Key works')).toBeVisible();
  await page.getByRole('button', { name: 'Test my key' }).click();
  await expect(page.getByText('Gemini did not accept the key. Check it in Settings.')).toBeVisible();
  await expect(page.getByText('Key works')).toHaveCount(0);
});
