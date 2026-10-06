import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { forceNativeAbort, releaseNativeAbort } from './failureKit';

test('VF02: a real replacement worker waits for confirmation and refuses to reload unsaved data', async ({ page }) => {
  let revision = 1;
  const dir = resolve('dist');
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
    try {
      let bytes = readFileSync(resolve(dir, '.' + (path === '/' ? '/index.html' : path)));
      if (path === '/sw.js') bytes = Buffer.from(bytes.toString() + `\n// isolated review revision ${revision}\n`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' } as Record<string,string>)[path === '/' ? '.html' : extname(path)] ?? 'application/octet-stream');
      res.end(bytes);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Assalam-o-alaikum, Noor' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await forceNativeAbort(page);
    await page.getByRole('button', { name: 'More people usually eating' }).click();
    await expect(page.locator('.save-banner')).toBeVisible();
    await page.evaluate(() => { (window as any).reviewPageMarker = 'original'; });
    revision++;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.locator('.update-banner')).toContainText('A new version is ready');
    expect(await page.evaluate(() => (window as any).reviewPageMarker)).toBe('original');
    await page.locator('.update-banner').getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('.update-banner')).toContainText('Your changes are not saved yet');
    expect(await page.evaluate(() => (window as any).reviewPageMarker)).toBe('original');
    await releaseNativeAbort(page);
    await Promise.all([
      page.waitForEvent('load'),
      page.locator('.update-banner').getByRole('button', { name: 'Update', exact: true }).click(),
    ]);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('5');
    expect(await page.evaluate(() => (window as any).reviewPageMarker)).toBeUndefined();
    await expect(page.locator('.update-banner')).toHaveCount(0);
  } finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
});
