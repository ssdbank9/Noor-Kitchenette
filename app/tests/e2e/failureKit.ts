import type { Page } from '@playwright/test';

// A real browser transaction is aborted after the request succeeds, before commit.
// No error is fabricated: IndexedDB rolls the write back and idb rejects tx.done.
export async function forceNativeAbort(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).reviewAbort = true;
    IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) {
      const request = key === undefined ? original.call(this, value) : original.call(this, value, key);
      if ((window as any).reviewAbort && this.name === 'meta' && key === 'settings') {
        const tx = this.transaction;
        tx.addEventListener('abort', () => { (window as any).reviewNativeAborted = true; });
        request.addEventListener('success', () => tx.abort());
      }
      return request;
    };
  });
}

export async function releaseNativeAbort(page: Page) {
  await page.evaluate(() => { (window as any).reviewAbort = false; });
}
