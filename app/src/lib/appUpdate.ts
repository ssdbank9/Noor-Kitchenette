// Registers the service worker in "prompt" mode: a new version waits until the user taps
// Update. Nothing reloads by itself. The banner (ui/UpdateBanner.tsx) reads this store.
import { registerSW } from 'virtual:pwa-register';

let waiting = false;
let reload: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

export function startAppUpdates(): void {
  reload = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      listeners.forEach(l => l());
    },
  });
}

export const updateWaiting = (): boolean => waiting;
export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Activates the waiting version and reloads the page. */
export function applyUpdate(): Promise<void> {
  return reload ? reload(true) : Promise.resolve();
}
