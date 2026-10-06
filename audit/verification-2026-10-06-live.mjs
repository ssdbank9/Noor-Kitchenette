import { chromium } from '../app/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = 'https://nooris-kitchenette.netlify.app';
const report = { at: new Date().toISOString(), environment: 'Installed desktop Chrome; isolated profile; synthetic data', checks: [] };
async function check(name, fn) {
  try { report.checks.push({ name, ...await fn() }); }
  catch (error) { report.checks.push({ name, error: error.message }); }
  console.log(name, JSON.stringify(report.checks.at(-1)));
}
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
await check('deployed assets match local build', async () => {
  const remote = await (await fetch(root)).text();
  const local = fs.readFileSync(new URL('../app/dist/index.html', import.meta.url), 'utf8');
  const paths = [...remote.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m => m[1]);
  const assets = [];
  for (const path of paths) {
    const res = await fetch(root + path);
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = new URL('../app/dist' + path, import.meta.url);
    assets.push({ path, status: res.status, sha256: hash(bytes), localMatch: fs.existsSync(file) && hash(fs.readFileSync(file)) === hash(bytes) });
  }
  return { htmlMatch: remote === local, assets };
});
await check('published mood list', async () => {
  const res = await fetch(root + '/eatout/moods.json');
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch {}
  return { status: res.status, contentType: res.headers.get('content-type'), isMoodJson: !!json?.moods, returnedAppHtml: text.includes('<!doctype html>') };
});
for (const [name, url] of [
  ['Al-Fatah rice search', 'https://alfatah.pk/search?q=rice'],
  ['Carrefour rice search', 'https://www.carrefour.pk/mafpak/en/search?keyword=rice'],
  ['foodpanda home', 'https://www.foodpanda.pk/'],
  ['Google Maps I-8 grocery search', 'https://www.google.com/maps/search/?api=1&query=grocery%20store%20near%20I-8%20Markaz'],
]) await check(name, async () => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const body = await res.text();
  return { status: res.status, finalUrl: res.url, title: body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0,200), bytes: Buffer.byteLength(body) };
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Karachi', locale: 'en-GB' });
  const page = await context.newPage();
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  await check('live six-tab phone-size UI and installability', async () => {
    const response = await page.goto(root); await page.getByRole('heading', { name: 'Assalam-o-alaikum, Noor' }).waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await context.newCDPSession(page);
    const install = await cdp.send('Page.getInstallabilityErrors');
    const tabs = [];
    for (const name of ['Plan','Pantry','Snacks','Shop','History','Today']) {
      const button = page.getByRole('navigation', { name:'Main' }).getByRole('button',{ name, exact:true });
      await button.click(); const box = await button.boundingBox();
      tabs.push({ name, current: await button.getAttribute('aria-current'), box, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    }
    await page.screenshot({ path: fileURLToPath(new URL('./verification-2026-10-06-live-phone.png', import.meta.url)) });
    return { status: response.status(), tabs, installabilityErrors: install.installabilityErrors, pageErrors };
  });
  await check('live saved settings survive offline reopening', async () => {
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'More people usually eating'}).click();
    await page.waitForFunction(() => !localStorage.getItem('noors-kitchen:pending'));
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true); await page.reload();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    const count = await page.locator('output[aria-label="People usually eating"]').innerText();
    await context.setOffline(false);
    return { expected: '5', actual: count, controller: await page.evaluate(() => !!navigator.serviceWorker.controller), pageErrors };
  });
  await context.close();
} finally { await browser.close(); }
fs.writeFileSync(new URL('./verification-2026-10-06-live.json', import.meta.url), JSON.stringify(report,null,2)+'\n');
