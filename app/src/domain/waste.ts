// The waste report (F68). Three sections that are never mixed:
//  - Thrown away: ingredient 'waste' events, and leftover portions wasted (from the leftover logs).
//  - Used up: cooking and everyday use, informational counts only.
//  - Corrections: stock checks (set-stock), how many changed stock.
import { activeEvents, rangeDates, type HistoryRange } from './ledger';
import { SAMPLE_PREFIX } from './samplePantry';
import type { KitchenEvent, Leftover } from './types';

export interface ThrownIngredient { eventId: string; localDate: string; ingredientId: string; amount: number }
export interface ThrownLeftover { leftoverId: string; name: string; localDate: string; portions: number }
export interface UsedEntry { eventId: string; localDate: string; ingredientId: string; amount: number }
export interface CorrectionEntry { eventId: string; localDate: string; ingredientId: string; delta: number; setTo: number | null | undefined }

export interface WasteReport {
  startDate: string;
  endDate: string;
  thrown: { ingredients: ThrownIngredient[]; leftovers: ThrownLeftover[]; leftoverPortions: number };
  usedUp: { mealsCooked: number; everyday: UsedEntry[]; byIngredient: { ingredientId: string; amount: number }[] };
  corrections: { checks: number; changed: number; entries: CorrectionEntry[] };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function wasteReport(events: KitchenEvent[], leftovers: Leftover[], range: HistoryRange, today: string): WasteReport {
  const { startDate, endDate } = rangeDates(range, today);
  const inRange = (d: string) => d >= startDate && d <= endDate;
  const live = activeEvents(events).filter(e => inRange(e.localDate)).reverse(); // newest first

  const ingredients: ThrownIngredient[] = [];
  const everyday: UsedEntry[] = [];
  const totals = new Map<string, number>();
  const entries: CorrectionEntry[] = [];
  let mealsCooked = 0;
  let checks = 0;
  let changed = 0;

  for (const e of live) {
    if (e.kind === 'waste') {
      for (const m of e.movements) ingredients.push({ eventId: e.id, localDate: e.localDate, ingredientId: m.ingredientId, amount: round3(-m.delta) });
    } else if (e.kind === 'cook' || e.kind === 'use') {
      if (e.kind === 'cook') mealsCooked += 1;
      for (const m of e.movements) {
        if (m.delta >= 0) continue;
        totals.set(m.ingredientId, round3((totals.get(m.ingredientId) ?? 0) - m.delta));
        if (e.kind === 'use') everyday.push({ eventId: e.id, localDate: e.localDate, ingredientId: m.ingredientId, amount: round3(-m.delta) });
      }
    } else if (e.kind === 'set-stock' && !e.id.startsWith(SAMPLE_PREFIX)) {
      checks += 1;
      if (e.movements.some(m => m.delta !== 0)) changed += 1;
      for (const m of e.movements) entries.push({ eventId: e.id, localDate: e.localDate, ingredientId: m.ingredientId, delta: m.delta, setTo: m.setTo });
    }
  }

  const thrownLeftovers: ThrownLeftover[] = [];
  for (const l of leftovers) {
    for (const entry of l.log) {
      if (entry.kind === 'wasted' && inRange(entry.localDate)) {
        thrownLeftovers.push({ leftoverId: l.id, name: l.name, localDate: entry.localDate, portions: entry.portions });
      }
    }
  }
  thrownLeftovers.sort((a, b) => b.localDate.localeCompare(a.localDate) || a.leftoverId.localeCompare(b.leftoverId));

  return {
    startDate, endDate,
    thrown: { ingredients, leftovers: thrownLeftovers, leftoverPortions: thrownLeftovers.reduce((n, t) => n + t.portions, 0) },
    usedUp: {
      mealsCooked, everyday,
      byIngredient: [...totals].map(([ingredientId, amount]) => ({ ingredientId, amount }))
        .sort((a, b) => b.amount - a.amount || a.ingredientId.localeCompare(b.ingredientId)),
    },
    corrections: { checks, changed, entries },
  };
}
