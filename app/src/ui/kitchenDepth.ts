// What the Pantry tab's extra views (Leftovers, Use soon, Waste) and the "Where and when"
// panel need from App (F65 to F68, F76). One object keeps the App.tsx hunks small.
import type { Batch, KitchenEvent, Leftover } from '../domain/types';

export type PantryView = 'items' | 'leftovers' | 'soon' | 'waste';

export interface KitchenDepth {
  view: PantryView;
  onView: (view: PantryView) => void;
  /** Household-local today, YYYY-MM-DD. */
  today: string;
  yesWord: string;
  noWord: string;
  leftovers: Leftover[];
  batches: Batch[];
  events: KitchenEvent[];
  /** Saves a changed leftover; `previous` lets the toast offer Undo. */
  onChangeLeftover: (next: Leftover, previous: Leftover | null, toast: string) => void;
  onSaveBatch: (batch: Batch, toast: string) => void;
  onDeleteBatch: (batch: Batch) => void;
  onUndoEvent: (eventId: string) => void;
}
