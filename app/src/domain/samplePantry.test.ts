import { describe, expect, it } from 'vitest';
import { demoPantry } from '../data/demoPantry';
import { balances } from './ledger';
import { removeSampleEvents, sampleEvents } from './samplePantry';

const NOW = new Date('2026-10-06T07:00:00Z');

describe('sample pantry (D-18)', () => {
  it('loads every demo amount as estimates, stamped now with fresh ids', () => {
    const events = sampleEvents(demoPantry, NOW, 'Asia/Karachi', 'a');
    expect(events).toHaveLength(demoPantry.length);
    expect(events.every(e => e.id.startsWith('sample-') && e.at === NOW.toISOString())).toBe(true);
    const stock = balances(events);
    expect(stock.get('Onion')).toMatchObject({ amount: 6, basis: 'estimate' });
    expect(stock.get('Basmati_Rice')?.amount).toBe(3000);
  });

  it('removes only the sample events still in effect, and can load again afterwards', () => {
    const first = sampleEvents(demoPantry, NOW, 'Asia/Karachi', 'a');
    const gone = removeSampleEvents(first, NOW);
    expect(gone).toHaveLength(first.length);
    expect(balances([...first, ...gone]).size).toBe(0);
    expect(removeSampleEvents([...first, ...gone], NOW)).toEqual([]);

    const second = sampleEvents(demoPantry, NOW, 'Asia/Karachi', 'b');
    const all = [...first, ...gone, ...second];
    expect(balances(all).get('Onion')?.amount).toBe(6);
    expect(removeSampleEvents(all, NOW)).toHaveLength(second.length);
    expect(removeSampleEvents(all, NOW, new Set([second[0].id]))).toHaveLength(1);
  });
});
