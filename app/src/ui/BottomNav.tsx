import type { ReactNode } from 'react';
import { BookIcon, SnackIcon, CalendarIcon, CartIcon, ChartIcon, HomeIcon, PantryIcon } from './Icons';

export type Tab = 'today' | 'plan' | 'pantry' | 'snacks' | 'shop' | 'recipes' | 'history';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <HomeIcon /> },
  { id: 'plan', label: 'Plan', icon: <CalendarIcon /> },
  { id: 'pantry', label: 'Pantry', icon: <PantryIcon /> },
  { id: 'snacks', label: 'Snacks', icon: <SnackIcon /> },
  { id: 'shop', label: 'Shop', icon: <CartIcon /> },
  { id: 'recipes', label: 'Recipes', icon: <BookIcon /> },
  { id: 'history', label: 'Cooked', icon: <ChartIcon /> },
];

export function BottomNav({ current, onChange }: { current: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          className="bottom-nav__item"
          aria-current={t.id === current ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
