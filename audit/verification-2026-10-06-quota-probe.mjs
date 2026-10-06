import { chromium } from '../app/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const report = {};
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = 'https://nooris-kitchenette.netlify.app';
  await page.goto(origin); await page.getByRole('button',{name:'Settings',exact:true}).click();
  const client = await context.newCDPSession(page);
  await client.send('Storage.overrideQuotaForOrigin',{origin,quotaSize:1});
  report.before = await client.send('Storage.getUsageAndQuota',{origin});
  report.write = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r=indexedDB.open('review-quota-probe',1); r.onupgradeneeded=()=>r.result.createObjectStore('pad'); r.onsuccess=()=>resolve(r.result); });
    const bytes=new Uint8Array(10*1024*1024);
    for(let i=0;i<bytes.length;i+=65536)crypto.getRandomValues(bytes.subarray(i,i+65536));
    return new Promise(resolve => {
      const tx=db.transaction('pad','readwrite'); tx.objectStore('pad').put(bytes,'one');
      tx.oncomplete=()=>resolve({ outcome:'committed' });
      tx.onabort=()=>resolve({outcome:'aborted',error:tx.error?.name});
    });
  });
  report.after = await client.send('Storage.getUsageAndQuota',{origin});
  await context.close();
} finally { await browser.close(); }
fs.writeFileSync(new URL('./verification-2026-10-06-quota-probe.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
