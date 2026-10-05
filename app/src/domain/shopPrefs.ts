// Default stores and empty shopping preferences (D-22). Every default is editable by Noor.
// Search links were checked for a response, not for good results; `unverified` says so and
// the button falls back to simply opening the store.
import type { ShopPrefs, Store } from './types';

export const DEFAULT_STORES: Store[] = [
  {
    id: 'alfatah', name: 'Al-Fatah', kind: 'online-search',
    searchUrl: 'https://alfatah.pk/search?q={q}',
    mapsQuery: 'Al-Fatah near I-8 Markaz Islamabad',
  },
  {
    id: 'pandamart', name: 'pandamart (foodpanda)', kind: 'copy-list',
    openUrl: 'https://www.foodpanda.pk/',
    note: 'No per-item link: copy the list, open foodpanda, search pandamart.',
  },
  {
    id: 'carrefour', name: 'Carrefour', kind: 'online-search',
    searchUrl: 'https://www.carrefour.pk/mafpak/en/search?keyword={q}',
    mapsQuery: 'Carrefour Islamabad', unverified: true,
  },
  {
    id: 'local', name: 'Local shops (I-8 Markaz)', kind: 'maps-only',
    mapsQuery: 'grocery store near I-8 Markaz Islamabad',
  },
];

export function defaultShopPrefs(): ShopPrefs {
  return { stores: DEFAULT_STORES.map(s => ({ ...s })), preferred: {}, dismissed: [] };
}

/** Always a usable prefs object, even for kitchens saved before this existed. */
export const shopPrefsOf = (saved: ShopPrefs | undefined): ShopPrefs => saved ?? defaultShopPrefs();
