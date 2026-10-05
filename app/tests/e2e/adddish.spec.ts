import { expect, test, type Page, type Route } from '@playwright/test';
import { openWithSamplePantry, saveFakeGeminiKey } from './helpers';

// No real network: every Gemini request is answered here. The two kinds of call are told apart
// by the request body: the grounded search call has `tools`, the JSON call has `responseSchema`.
const GEMINI = 'https://generativelanguage.googleapis.com/**';
const PAGE = 'https://foodfusion.com/recipe/haleem/';
const VIDEO = 'https://www.youtube.com/watch?v=abc123';

const CANDIDATES = {
  candidates: [
    { title: 'Beef Haleem', sourceName: 'Food Fusion', sourceUrl: PAGE, videoUrl: VIDEO, rating: 4.9, ratingCount: 155, views: 1_200_000, summary: 'A slow-cooked wheat and meat stew.' },
    { title: 'Quick Haleem', sourceName: 'Food Fusion', sourceUrl: 'https://foodfusion.com/recipe/quick-haleem/', videoUrl: null, rating: null, ratingCount: null, views: null, summary: 'A faster pressure-cooker version.' },
    { title: 'Invented Haleem', sourceName: 'Nowhere', sourceUrl: 'https://invented.example/haleem', videoUrl: null, rating: 5, ratingCount: 99999, views: null, summary: 'Should never appear.' },
  ],
};
const RECIPE = {
  title: 'Beef Haleem', serves: 4, time: '3 hr',
  ingredients: [
    { name: 'boneless chicken', amount: 500, unit: 'g', optional: false },
    { name: 'onions', amount: 3, unit: 'pc', optional: false },
    { name: 'salt', amount: 2, unit: 'tsp', optional: false },
    { name: 'cracked wheat', amount: 250, unit: 'g', optional: false },
    { name: 'ginger garlic paste', amount: 2, unit: 'tbsp', optional: false },
    { name: 'lemon', amount: 1, unit: 'pc', optional: true },
  ],
  steps: ['Soak the cracked wheat overnight.', 'Cook the meat until it falls apart, then mash with the wheat.'],
  videoUrl: null,
};

const answer = (text: string, sources: { uri: string; title: string }[] = []) => ({
  candidates: [{
    content: { parts: [{ text }] }, finishReason: 'STOP',
    groundingMetadata: { groundingChunks: sources.map(s => ({ web: s })) },
  }],
});

interface Seen { search: number; json: number }

async function cannedGemini(page: Page): Promise<Seen> {
  const seen: Seen = { search: 0, json: 0 };
  await page.route(GEMINI, async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const isJson = Boolean(body.generationConfig?.responseSchema);
    const isSearch = Boolean(body.tools);
    expect(isJson && isSearch).toBe(false); // search and JSON are separate calls
    const prompt: string = body.contents[0].parts[0].text;
    let reply: unknown;
    if (isSearch) {
      seen.search++;
      reply = answer(prompt.includes('Find recipes for') ? 'Found three pages.' : 'The recipe text.', [
        { uri: PAGE, title: 'Food Fusion' },
        { uri: 'https://foodfusion.com/recipe/quick-haleem/', title: 'Food Fusion' },
        { uri: VIDEO, title: 'YouTube' },
      ]);
    } else {
      seen.json++;
      reply = answer(JSON.stringify('candidates' in body.generationConfig.responseSchema.properties ? CANDIDATES : RECIPE));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return seen;
}

const openFromToday = async (page: Page) => {
  await page.getByRole('button', { name: /Add a new dish/ }).click();
  await expect(page.getByRole('heading', { name: 'Add a new dish' })).toBeVisible();
};
const search = async (page: Page, name: string) => {
  await page.getByRole('textbox', { name: /What is the dish called/ }).fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
};

test('typing korma shows the household Qorma first and makes no online request', async ({ page }) => {
  let calls = 0;
  await page.route(GEMINI, route => { calls++; return route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'See all' }).click();
  await page.getByRole('button', { name: '+ Add dish' }).click();
  await search(page, 'korma');

  await expect(page.getByRole('heading', { name: 'You already have these' })).toBeVisible();
  await expect(page.locator('.adddish .row__name').first()).toHaveText('Chicken Qorma');
  await expect(page.getByRole('button', { name: /look online instead/i })).toBeVisible();
  expect(calls).toBe(0);

  await page.getByRole('button', { name: 'Open Chicken Qorma' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Chicken Qorma' })).toBeVisible();
});

test('haleem online: candidates, choose, fix flagged lines, stock check, save, and it opens', async ({ page }) => {
  await page.goto('/');
  await openWithSamplePantry(page);
  await saveFakeGeminiKey(page);
  const seen = await cannedGemini(page);

  await openFromToday(page);
  await search(page, 'haleem');

  // Candidates: evidence shown honestly, the invented link is gone.
  await expect(page.getByRole('heading', { name: /Found online for "haleem"/ })).toBeVisible();
  const cards = page.locator('.dish-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Beef Haleem');
  await expect(cards.nth(0)).toContainText('Food Fusion');
  await expect(cards.nth(0)).toContainText('★ 4.9 (155 ratings)');
  await expect(cards.nth(0)).toContainText('1.2M views');
  await expect(cards.nth(0)).toContainText('▶ Video');
  await expect(cards.nth(0)).toContainText(/checked \d{1,2} \w{3} \d{4}/);
  await expect(cards.nth(1)).toContainText('rating not checked');
  await expect(cards.nth(1)).toContainText('views not checked');
  await expect(page.getByText('Invented Haleem')).toHaveCount(0);
  expect(seen).toEqual({ search: 1, json: 1 });

  await page.getByRole('button', { name: 'Use Beef Haleem from Food Fusion' }).click();
  await expect(page.getByRole('heading', { name: 'Check the recipe' })).toBeVisible();
  expect(seen).toEqual({ search: 2, json: 2 });

  // Two lines are flagged and saving is blocked.
  const save = page.getByRole('button', { name: 'Save to my recipes' });
  await expect(page.getByText('Which of yours is this?')).toHaveCount(2);
  await expect(save).toBeDisabled();
  await expect(page.getByText('Fix 2 lines first')).toBeVisible();

  // The picker keeps focus while she types.
  await page.getByRole('button', { name: 'Search my ingredients for boneless chicken' }).click();
  const picker = page.getByRole('searchbox', { name: 'Search your ingredients' });
  await picker.click();
  await page.keyboard.type('chick', { delay: 40 });
  await expect(picker).toBeFocused();
  await expect(picker).toHaveValue('chick');
  await page.getByRole('button', { name: 'Pick Chicken for boneless chicken' }).click();
  await expect(page.getByText('Which of yours is this?')).toHaveCount(1);

  // The other line becomes a new ingredient.
  await page.getByRole('button', { name: 'New ingredient for cracked wheat' }).click();
  await page.getByRole('button', { name: 'Add as new ingredient' }).click();
  await expect(page.getByText('New ingredient: cracked wheat')).toBeVisible();
  await expect(save).toBeEnabled();

  // Exact numeric entry on an amount.
  const amount = page.getByRole('textbox', { name: 'Amount for onions' });
  await amount.fill('1/2');
  await expect(amount).toHaveValue('1/2');
  await amount.fill('3');

  // Stock check: counts, names what is missing, recomputes with the stepper.
  const status = page.locator('.adddish__stock .status');
  await expect(status).toHaveText(/You have \d of 5 ingredients for \d+/);
  await expect(page.getByText(/Missing: .*cracked wheat/i)).toBeVisible();
  const before = await status.innerText();
  await page.getByRole('button', { name: 'More people' }).click();
  await page.getByRole('button', { name: 'More people' }).click();
  expect(await status.innerText()).not.toBe(before);

  // The source link and date checked are kept, and the confirmed video link is offered.
  await expect(page.getByRole('link', { name: 'Food Fusion' })).toHaveAttribute('href', PAGE);
  await expect(page.getByRole('link', { name: 'Watch video', exact: false })).toHaveAttribute('href', VIDEO);

  // Add what is missing to the shopping list.
  await page.getByRole('button', { name: 'Add missing to list' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to Shop' })).toBeVisible();

  await save.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Beef Haleem' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read recipe' })).toHaveAttribute('href', PAGE);

  // It is a new recipe in Recipes (the starter recipes are untouched) and the shop list names it.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.recipes .row__name', { hasText: 'Beef Haleem' })).toBeVisible();
  await expect(page.locator('.recipes .row__name', { hasText: 'Chicken Qorma' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(page.getByText('For Beef Haleem').first()).toBeVisible();
  await expect(page.getByText('Cracked wheat').first()).toBeVisible();

  // And it survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'See all' }).click();
  await expect(page.locator('.recipes .row__name', { hasText: 'Beef Haleem' })).toBeVisible();
});

test('typing haleem again later finds the saved dish first and by the name she typed', async ({ page }) => {
  await page.goto('/');
  await saveFakeGeminiKey(page);
  await cannedGemini(page);
  await openFromToday(page);
  await search(page, 'halim');
  await page.getByRole('button', { name: 'Use Quick Haleem from Food Fusion' }).click();
  // No confirmed video for this one: the link is a YouTube search, and says so.
  await expect(page.getByRole('link', { name: /Watch video/ })).toHaveAttribute('href', /youtube\.com\/results\?search_query=Beef%20Haleem/);
  await expect(page.getByRole('link', { name: 'Watch video · YouTube search' })).toBeVisible();
  await page.getByRole('button', { name: 'Search my ingredients for boneless chicken' }).click();
  await page.getByRole('searchbox', { name: 'Search your ingredients' }).fill('chick');
  await page.getByRole('button', { name: 'Pick Chicken for boneless chicken' }).click();
  await page.getByRole('button', { name: 'Leave out cracked wheat' }).click();
  await page.getByRole('button', { name: 'Save to my recipes' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: '+ Add dish' }).click();
  await search(page, 'haleem');
  await expect(page.getByRole('heading', { name: 'You already have these' })).toBeVisible();
  await expect(page.locator('.adddish .row__name').first()).toHaveText('Beef Haleem');
});

test('with no key it explains how to add one and nothing is sent', async ({ page }) => {
  let calls = 0;
  await page.route(GEMINI, route => { calls++; return route.abort(); });
  await page.goto('/');
  await openFromToday(page);
  await search(page, 'haleem');
  await expect(page.getByRole('alert')).toContainText('Add your Gemini key in Settings');
  await expect(page.getByRole('button', { name: 'Open Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search again with a different spelling' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  expect(calls).toBe(0);
});

test('a dropped connection shows a message and Try again works once the network is back', async ({ page }) => {
  await page.goto('/');
  await saveFakeGeminiKey(page);
  await page.route(GEMINI, route => route.abort('connectionfailed'));
  await openFromToday(page);
  await search(page, 'haleem');
  await expect(page.getByRole('alert')).toContainText('No internet connection');
  await expect(page.getByRole('button', { name: 'Search again with a different spelling' })).toBeVisible();

  await page.unroute(GEMINI);
  await cannedGemini(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: /Found online for "haleem"/ })).toBeVisible();
});

test('when nothing is found it says so and suggests another spelling', async ({ page }) => {
  await page.goto('/');
  await saveFakeGeminiKey(page);
  await page.route(GEMINI, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const text = body.generationConfig?.responseSchema ? JSON.stringify({ candidates: [] }) : 'Nothing found.';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(text)) });
  });
  await openFromToday(page);
  await search(page, 'zzzz');
  await expect(page.getByRole('status').filter({ hasText: 'Nothing found for "zzzz"' })).toContainText('another spelling');
});
