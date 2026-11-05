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
const guesses = (list: { label: string; matches: string[] }[]) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ guesses: list }) }] }, finishReason: 'STOP' }],
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
  await page.getByRole('button', { name: 'Add food with a photo' }).click();
  await page.getByRole('button', { name: kind }).click();
}
const pickPhoto = (page: Page) => page.getByLabel('Photo from gallery').setInputFiles(photo);
const save = (page: Page) => page.getByRole('button', { name: /^Save \d/ });

test('groceries photo: a ready row for what it knew, a question card for what it did not', async ({ page }) => {
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
  expect(mock.bodies[0]).toContain('inlineData');

  // Tomatoes matched and is sure: a quiet ready row with its before → after, no checkbox.
  await expect(page.getByText('1 of 2 ready')).toBeVisible();
  const tomatoStock = page.getByLabel('Stock of Tomato');
  await expect(tomatoStock).toContainText(`${before} pc`);
  await expect(tomatoStock).toContainText(`${before + 6} pc`);

  // Mystery bag matched nothing: it asks the question in plain words, with a way to answer.
  const card = page.locator('.snapcard').filter({ hasText: 'Mystery bag' });
  await expect(card.getByText('Which of your things is this?')).toBeVisible();
  await expect(card.getByText("I wasn't sure about this one — please check it.")).toBeVisible();
  await expect(card.getByRole('button', { name: "It's something new" })).toBeVisible();

  // A second, batched call guesses what the unmatched thing is.
  await expect.poll(() => mock.calls).toBe(2);
  expect(mock.bodies[1]).toContain('Mystery bag');

  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pantry updated' })).toBeVisible();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before + 6);
});

test('the model guess becomes a one-tap chip for an unmatched line', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [
    json(answer([{ label: 'floral bottle', count: 1, certainty: 'sure' }])),
    json(guesses([{ label: 'floral bottle', matches: ['Rose water'] }])),
  ]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);

  const card = page.locator('.snapcard').filter({ hasText: 'floral bottle' });
  await expect(card.getByText('Which of your things is this?')).toBeVisible();
  // The model's idea arrives as a chip; one tap makes a new ingredient and the card is ready.
  await card.getByRole('button', { name: 'Rose water' }).click();
  await expect(page.getByText('1 of 1 ready')).toBeVisible();
  await expect(page.getByText(/Rose water \(new\) — 1 pc/)).toBeVisible();

  await save(page).click();
  await openPantry(page);
  await expect(row(page, 'Rose water')).toBeVisible();
});

test('ranked own-ingredient chips answer the question in one tap', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'tomato can', count: 2, certainty: 'sure' }]))]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);

  const card = page.locator('.snapcard').filter({ hasText: 'tomato can' });
  await card.getByRole('button', { name: 'Tomato', exact: true }).click();
  await expect(page.getByText('1 of 1 ready')).toBeVisible();
  await expect(page.getByText(/Tomato — 2 pc/)).toBeVisible();
});

test('an unsure matched line waits for Haan before it is ready', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Tomatoes', count: 6, certainty: 'unsure' }]))]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);

  // Matched but unsure: the card asks, and nothing is ready yet.
  const card = page.locator('.snapcard').filter({ hasText: 'Tomatoes' });
  await expect(card.getByText(/Is this your/)).toBeVisible();
  await expect(card.getByText("I wasn't sure about this one — please check it.")).toBeVisible();
  await expect(page.getByText('0 of 1 ready')).toBeVisible();
  await card.getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(page.getByText('1 of 1 ready')).toBeVisible();
});

test('"It\'s something new" makes the ingredient right there', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Mystery bag', count: 1, certainty: 'sure' }]))]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);

  const card = page.locator('.snapcard').filter({ hasText: 'Mystery bag' });
  await card.getByRole('button', { name: "It's something new" }).click();
  await expect(page.getByText(/Mystery bag \(new\) — 1 pc/)).toBeVisible();
  await save(page).click();
  await openPantry(page);
  await expect(row(page, 'Mystery bag')).toBeVisible();
});

test('"Not this" parks the line in a tray and it is never saved; bring back restores it', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([
    { label: 'Tomatoes', count: 6, certainty: 'sure' },
    { label: 'Mystery bag', count: 1, certainty: 'sure' },
  ]))]);
  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);

  await page.getByRole('button', { name: 'Not this: Tomatoes' }).click();
  await expect(page.getByText('Not saving these (1)')).toBeVisible();
  await expect(page.getByText('0 of 1 ready')).toBeVisible();

  await page.getByRole('button', { name: 'Bring back Tomatoes' }).click();
  await expect(page.getByText('1 of 2 ready')).toBeVisible();
  await save(page).click();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before + 6);
});

test('a read with boxes shows a thumbnail of the item on its card', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Tomatoes', count: 6, certainty: 'sure', box: [0, 0, 1000, 1000] }]))]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of Tomatoes' })).toBeVisible();
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

  // One merged ready row: amount from the receipt, its price, and where it was seen.
  await expect(page.locator('.snapcard')).toHaveCount(1);
  const merged = page.locator('.snapcard').first();
  await expect(merged).toContainText('Basmati Rice — 5 kg');
  await expect(merged).toContainText('Rs 1400');
  await expect(merged).toContainText('in both photos');
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
  const card = page.locator('.snapcard').filter({ hasText: 'Basmati Rice' });
  await expect(card.getByText(/The pack says 5 kg/)).toBeVisible();
  await expect(card.getByText('How much is left?').first()).toBeVisible();
  await expect(page.getByLabel('Amount of Basmati Rice')).toHaveValue('');
  await expect(page.getByText('0 of 1 ready')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save 0/ })).toBeDisabled();

  await page.getByLabel('Amount of Basmati Rice').fill('1.5');
  await expect(page.getByText('1 of 1 ready')).toBeVisible();
  await save(page).click();
  await openPantry(page);
  const after = await amountText(page, 'Basmati Rice');
  expect(after).toContain('1.5 kg');
  expect(after).not.toContain('a guess');
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
  const listInput = page.getByRole('textbox', { name: 'Your list' });
  await listInput.fill('Tomatoes 4');
  await listInput.press('Enter');
  await listInput.fill('Pyaz 2 kg');
  await listInput.press('Enter');
  await page.getByRole('button', { name: 'Check my list' }).click();
  await expect(page.getByText('1 of 2 ready')).toBeVisible();
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
  const listInput = page.getByRole('textbox', { name: 'Your list' });
  await listInput.fill('Onion 3');
  await listInput.press('Enter');
  await page.getByRole('button', { name: 'Check my list' }).click();
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  await expect(page.getByText('1 of 1 ready')).toBeVisible();
});

test('Settings: Test my key shows "Key works" and the plain error', async ({ page }) => {
  await page.goto('/');
  await mockGemini(page, [
    json({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }),
    json({ error: { message: 'API key not valid' } }, 403),
  ]);
  await saveFakeGeminiKey(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Photos are sent to the reader only to be read. Small cut-out pictures of the items stay on this phone until you save or throw away the list.')).toBeVisible();
  await page.getByRole('button', { name: 'Test my key' }).click();
  await expect(page.getByText('Key works')).toBeVisible();
  await page.getByRole('button', { name: 'Test my key' }).click();
  await expect(page.getByText('Gemini did not accept the key. Check it in Settings.')).toBeVisible();
  await expect(page.getByText('Key works')).toHaveCount(0);
});

test('a reading survives a page reload and comes back for review (phone background/return)', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Tomatoes', count: 6, certainty: 'sure' }]))]);
  await openPantry(page);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();

  // The phone browser discarded and reloaded the page (memory pressure): the reading is kept.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  await expect(page.getByText(/Tomato — 6 pc/)).toBeVisible();

  // Saving clears the recovery copy, so a later reload starts clean.
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pantry updated' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Hello Noori/ })).toBeVisible();
});

test('Command Code provider reads a photo and saves once (Qwen vision)', async ({ page }) => {
  await openWithSamplePantry(page);
  // Save a Command Code key through Settings: with no Gemini key, the provider is Command Code.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const photoPanel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Who reads the photos?' }) });
  await photoPanel.getByRole('button', { name: 'Command Code', exact: true }).click();
  await photoPanel.getByRole('textbox', { name: 'Command Code secret key' }).fill('cc-fake-key-0001');
  await photoPanel.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('Command Code key saved on this phone.')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  const state = { calls: 0, bodies: [] as string[] };
  await page.route('https://api.commandcode.ai/**', async route => {
    state.calls++;
    state.bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ label: 'Tomatoes', count: 6, certainty: 'sure' }], note: '' }) }, finish_reason: 'stop' }] }) });
  });

  await openPantry(page);
  const before = await pieces(page, 'Tomato');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();
  expect(state.calls).toBe(1);
  expect(state.bodies[0]).toContain('image_url');
  expect(state.bodies[0]).toContain('Qwen3.8-Omni-Flash');

  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pantry updated' })).toBeVisible();
  await openPantry(page);
  expect(await pieces(page, 'Tomato')).toBe(before + 6);
});

test('Back from the review asks to keep or throw away, and Throw it away discards everything', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([{ label: 'Tomatoes', count: 6, certainty: 'sure' }]))]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  await pickPhoto(page);
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();

  // Back no longer drops her straight out: it asks what to do with the list.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Leave this list?' })).toBeVisible();

  // "Keep it for later" leaves and the reading is still there when she returns.
  await page.getByRole('button', { name: 'Keep it for later' }).click();
  await page.getByRole('button', { name: 'Add food with a photo' }).click();
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toBeVisible();

  // "Throw it away" discards: returning starts from the beginning, no old list.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Throw it away' }).click();
  await page.getByRole('button', { name: 'Add food with a photo' }).click();
  await expect(page.getByRole('heading', { name: 'Check what I read' })).toHaveCount(0);
  await expect(page.getByText('What is this photo?')).toBeVisible();
});

test('a photo that reads nothing shows the model\'s note and which model read it', async ({ page }) => {
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  await mockGemini(page, [json(answer([], 'The image is too dark to see anything.'))]);
  await openPantry(page);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await startSnap(page, 'New groceries');
  // The Snap screen names the active provider and model.
  await expect(page.getByText(/Reading with Gemini · gemini-3/)).toBeVisible();
  await pickPhoto(page);
  await expect(page.getByRole('alert')).toContainText('Gemini said: "The image is too dark to see anything."');
});
