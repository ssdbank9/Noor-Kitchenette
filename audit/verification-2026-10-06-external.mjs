import { chromium } from '../app/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const root = 'https://nooris-kitchenette.netlify.app';
const published = await (await fetch(root + '/eatout/moods.json')).json();
const names = Object.keys(published.moods);
const places = Object.values(published.moods).flat();
const report = { at: new Date().toISOString(), restaurantList: {
  generatedAt: published.generatedAt, moods: names, entries: places.length,
  unsafeUrls: places.filter(p => !/^https:\/\//.test(p.url ?? '')).length,
  forbiddenFields: places.filter(p => ['deliveryMinutes','distanceKm','home','searchCentre'].some(k => k in p)).length,
  publishedMatchesLocal: JSON.stringify(published) === JSON.stringify(JSON.parse(fs.readFileSync(new URL('../app/public/eatout/moods.json', import.meta.url)))),
}, browserLinks: [] };
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const context = await browser.newContext({ viewport: {width:390,height:844}, locale:'en-GB' });
  for (const [name,url] of [
    ['Al-Fatah rice search','https://alfatah.pk/search?q=rice'],
    ['Carrefour rice search','https://www.carrefour.pk/mafpak/en/search?keyword=rice'],
    ['foodpanda restaurant from published list', places.find(p => p.url)?.url],
  ]) {
    const page = await context.newPage();
    try {
      const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
      const text = (await page.locator('body').innerText({timeout:5000})).slice(0,40000);
      report.browserLinks.push({ name, status:response.status(), finalUrl:page.url(), title:await page.title(),
        riceTextPresent: /rice/i.test(text), refusal: /too many requests|access denied|captcha|checking your browser|403 forbidden/i.test(text),
        productLinks: await page.locator('a[href*="/products/"], a[href*="/p/"]').count(),
        menuTextPresent:/menu|popular|delivery|restaurants/i.test(text) });
    } catch(error) { report.browserLinks.push({ name,error:error.message }); }
    await page.close();
  }
  await context.close();
} finally { await browser.close(); }
fs.writeFileSync(new URL('./verification-2026-10-06-external.json',import.meta.url), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
