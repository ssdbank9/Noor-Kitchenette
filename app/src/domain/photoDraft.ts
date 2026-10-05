// Snap pantry review model (F28, F29, F30, F52, F53, F57, F73). Pure functions: turn what
// Gemini read (or what Noor typed) into editable draft lines, merge a second photo of the
// same shopping trip, and build the ONE KitchenEvent a confirmed draft becomes.
//
// Rules this file enforces:
//  - A draft never touches stock. Only buildDraftEvent makes an event, and only from lines
//    Noor switched on.
//  - A printed package size ("5 kg") is never a remaining amount. For 'pantry' photos only an
//    amount Gemini read as an amount (or Noor types) becomes the remaining amount.
//  - The same item seen in two photos is MERGED into one line, never summed (the receipt
//    reading wins, else the first). Receipt prices stay separate from quantities.
//  - Unsure or unmatched lines start OFF. Gemini amounts are basis 'estimate'; any value
//    Noor edits becomes 'measured'.
//  - The event id is made when the draft is made and reused on every retry (idempotent).
import type { DetectedItem, PhotoKind } from '../gemini/drafts';
import type { Balance } from './ledger';
import { makeEvent, newEventId } from './ledger';
import { parseAmountText, quickAmounts, unitsFor } from './pantryActions';
import type { Dimension, Ingredient, KitchenEvent } from './types';
import { KNOWN_UNITS, matchIngredient, normaliseUnit, parseQuantityLine, toBase } from './units';

export type DraftMode = 'purchase' | 'pantry';
export const modeOf = (kind: PhotoKind): DraftMode => (kind === 'pantry' ? 'pantry' : 'purchase');

export interface DraftLine {
  key: string;
  /** What the photo (or Noor) said, shown as "Read: ...". */
  label: string;
  ingredientId: string | null;
  /** An ingredient made in this review; only saved if its line is saved. */
  newIngredient: Ingredient | null;
  /** The amount as typed in the box; '' means none yet. */
  amount: string;
  /** '' until a unit is chosen. */
  unit: string;
  basis: 'estimate' | 'measured';
  /** Gemini was not sure (or the amount is only a guess). Cleared when Noor edits the amount. */
  unsure: boolean;
  on: boolean;
  priceRs: number | null;
  /** Source numbers (photos or typed lists) this item was found in. */
  seenIn: number[];
  /** Kind of the source this reading came from (the receipt reading is preferred on a merge). */
  kind: PhotoKind;
  origin: 'photo' | 'typed';
  /** e.g. "Package says 5 kg": shown beside the line, never used as an amount for 'pantry'. */
  packageNote: string;
  edited: boolean;
}

export interface Draft {
  /** Made when the draft is made; reused on every save attempt so a retry cannot double-add. */
  eventId: string;
  mode: DraftMode;
  kinds: PhotoKind[];
  /** Kinds of the sources that were photos (decides source 'photo' or 'receipt'). */
  photoKinds: PhotoKind[];
  sources: number;
  lines: DraftLine[];
  notes: string[];
}

export function newDraft(kind: PhotoKind, eventId: string = newEventId()): Draft {
  return { eventId, mode: modeOf(kind), kinds: [kind], photoKinds: [], sources: 0, lines: [], notes: [] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const shownQuantity = (q: { amount: number; unit: string }) => `${round3(q.amount)} ${q.unit}`;

/** The ingredient a line points at (a new one made in the review, else one of Noor's). */
export function ingredientOf(line: DraftLine, ingredients: Ingredient[]): Ingredient | undefined {
  return line.newIngredient ?? (line.ingredientId ? ingredients.find(i => i.id === line.ingredientId) : undefined);
}

/** Matches what was read to one of Noor's ingredients; tries the label, then the label without its numbers and units. */
export function matchLabel(label: string, ingredients: Ingredient[]): Ingredient | null {
  const direct = matchIngredient(label, ingredients);
  if (direct) return direct;
  const parsed = parseQuantityLine(label);
  if ('name' in parsed) {
    const byName = matchIngredient(parsed.name, ingredients);
    if (byName) return byName;
  }
  const words = label.split(/\s+/).filter(w => w && !/\d/.test(w) && !normaliseUnit(w));
  return words.length ? matchIngredient(words.join(' '), ingredients) : null;
}

export type LineCheck = { ok: true; value: number; amount: number } | { ok: false; reason: string };

/** Can this line be saved as it stands? Gives the plain reason when not. */
export function checkLine(line: DraftLine, ing: Ingredient | undefined, mode: DraftMode): LineCheck {
  if (!ing) return { ok: false, reason: 'Pick which of yours this is' };
  const amount = parseAmountText(line.amount);
  if (amount === null) return { ok: false, reason: mode === 'pantry' ? 'How much is left?' : 'How much did you buy?' };
  if (mode === 'purchase' && amount <= 0) return { ok: false, reason: 'Enter an amount above zero.' };
  if (!line.unit) return { ok: false, reason: 'Choose a unit.' };
  const base = toBase(amount, line.unit, ing);
  if (!base.ok) return { ok: false, reason: base.reason };
  return { ok: true, value: round3(base.value), amount };
}

/** Switched on by default only when nothing needs checking. */
const isReady = (line: DraftLine, ing: Ingredient | undefined, mode: DraftMode) => !line.unsure && checkLine(line, ing, mode).ok;

/** The label shown on a line that starts off: why Noor needs to look at it. */
export function checkThis(line: DraftLine, ing: Ingredient | undefined, mode: DraftMode): string | null {
  const c = checkLine(line, ing, mode);
  if (!c.ok) return c.reason;
  return line.unsure ? 'Gemini was not sure' : null;
}

export interface LinePreview {
  ok: true;
  /** Stock now, in base units; null = Noor said not sure. */
  before: number | null;
  /** Stock after saving; null = still not sure. */
  after: number | null;
  delta: number;
}

/** Before -> after stock for one line. */
export function previewLine(line: DraftLine, ing: Ingredient | undefined, mode: DraftMode, balance: Balance | undefined): LinePreview | null {
  const c = checkLine(line, ing, mode);
  if (!c.ok) return null;
  const before = balance ? balance.amount : 0;
  if (mode === 'purchase') return { ok: true, before, after: before === null ? null : round3(before + c.value), delta: c.value };
  return { ok: true, before, after: c.value, delta: round3(c.value - (before ?? 0)) };
}

/** A blank amount still gets a sensible unit (the package's, else the ingredient's usual one), so Noor only types a number. */
function withUnit(q: { amount: string; unit: string }, ing: Ingredient | null, packageUnit?: string): { amount: string; unit: string } {
  if (q.unit || !ing) return q;
  const preferred = packageUnit && unitsFor(ing).includes(packageUnit) ? packageUnit : quickAmounts(ing)[0]?.unit ?? '';
  return { amount: q.amount, unit: preferred };
}

function lineAmount(item: DetectedItem, mode: DraftMode, ing: Ingredient | null): { amount: string; unit: string; packageNote: string } {
  const packageNote = item.packageSize ? `Package says ${shownQuantity(item.packageSize)}` : '';
  const pieces = (count: number) => (!ing || toBase(1, 'pc', ing).ok ? { amount: String(count), unit: 'pc' } : null);
  if (mode === 'purchase') {
    if (item.count !== null && item.packageSize) {
      return { amount: String(round3(item.count * item.packageSize.amount)), unit: item.packageSize.unit, packageNote };
    }
    if (item.amount) return { amount: String(item.amount.amount), unit: item.amount.unit, packageNote };
    const p = item.count !== null ? pieces(item.count) : null;
    return { ...(p ?? { amount: '', unit: '' }), packageNote };
  }
  // 'pantry': a package size alone NEVER becomes a remaining amount.
  if (item.amount) return { amount: String(item.amount.amount), unit: item.amount.unit, packageNote };
  const p = item.count !== null && !item.packageSize ? pieces(item.count) : null;
  return { ...(p ?? { amount: '', unit: '' }), packageNote };
}

/** Draft lines from what Gemini read. Unsure or unmatched lines start off. */
export function linesFromPhoto(items: DetectedItem[], kind: PhotoKind, sourceNo: number, ingredients: Ingredient[]): DraftLine[] {
  const mode = modeOf(kind);
  return items.map((item, i) => {
    const ing = matchLabel(item.label, ingredients);
    const q = { ...lineAmount(item, mode, ing), ...withUnit(lineAmount(item, mode, ing), ing, item.packageSize?.unit) };
    const line: DraftLine = {
      key: `s${sourceNo}-${i}`,
      label: item.label,
      ingredientId: ing?.id ?? null,
      newIngredient: null,
      amount: q.amount,
      unit: q.unit,
      basis: 'estimate',
      unsure: item.certainty !== 'sure',
      on: false,
      priceRs: item.priceRs,
      seenIn: [sourceNo],
      kind,
      origin: 'photo',
      packageNote: q.packageNote,
      edited: false,
    };
    return { ...line, on: isReady(line, ing ?? undefined, mode) };
  });
}

/** Draft lines from a typed list ("Chicken 500 g"). Lines that cannot be read are returned as errors. */
export function linesFromTyped(text: string, kind: PhotoKind, sourceNo: number, ingredients: Ingredient[]): { lines: DraftLine[]; errors: string[] } {
  const mode = modeOf(kind);
  const lines: DraftLine[] = [];
  const errors: string[] = [];
  const rows = text.split(/\r?\n/).map((t, n) => ({ t: t.trim(), n: n + 1 })).filter(r => r.t);
  if (rows.length > 40) errors.push('That is a lot for one list. Keep it to 40 lines.');
  for (const { t, n } of rows.slice(0, 40)) {
    const parsed = parseQuantityLine(t);
    if ('error' in parsed) { errors.push(`Line ${n}: ${parsed.error}`); continue; }
    const ing = matchIngredient(parsed.name, ingredients);
    const q = parsed.quantity;
    const typedUnit = withUnit({ amount: '', unit: q.amount === null ? '' : q.unit }, ing).unit;
    const line: DraftLine = {
      key: `s${sourceNo}-${lines.length}`,
      label: parsed.name,
      ingredientId: ing?.id ?? null,
      newIngredient: null,
      amount: q.amount === null ? '' : String(q.amount),
      unit: typedUnit,
      basis: q.basis === 'estimate' ? 'estimate' : 'measured',
      unsure: false,
      on: false,
      priceRs: null,
      seenIn: [sourceNo],
      kind,
      origin: 'typed',
      packageNote: '',
      edited: false,
    };
    lines.push({ ...line, on: isReady(line, ing ?? undefined, mode) });
  }
  return { lines, errors };
}

/**
 * Adds a photo's (or typed list's) lines to the draft. An item that matches the same
 * ingredient as a line from an EARLIER source is merged into that line, not added to it:
 * "seen in both photos". The receipt reading is preferred, else the first; a line Noor
 * already edited is kept as she left it.
 */
export function addSource(
  draft: Draft,
  kind: PhotoKind,
  incoming: DraftLine[],
  origin: 'photo' | 'typed',
  note: string,
  ingredients: Ingredient[],
): Draft {
  const sourceNo = draft.sources + 1;
  const mode = draft.mode;
  const out = [...draft.lines];
  const merged = new Set<string>();
  for (const inc of incoming) {
    const idx = out.findIndex(l =>
      !merged.has(l.key) && !l.seenIn.includes(sourceNo) &&
      (inc.ingredientId ? l.ingredientId === inc.ingredientId : !l.ingredientId && !l.newIngredient && l.label.toLowerCase() === inc.label.toLowerCase()));
    if (idx < 0) { out.push(inc); continue; }
    const cur = out[idx];
    merged.add(cur.key);
    const preferNew = !cur.edited && inc.kind === 'receipt' && cur.kind !== 'receipt';
    const chosen: DraftLine = preferNew ? { ...inc, key: cur.key } : cur;
    const ing = ingredientOf(chosen, ingredients);
    out[idx] = {
      ...chosen,
      priceRs: chosen.priceRs ?? inc.priceRs ?? cur.priceRs,
      seenIn: [...cur.seenIn, sourceNo],
      on: preferNew ? isReady(chosen, ing, mode) : cur.on,
    };
  }
  return {
    ...draft,
    kinds: draft.kinds.includes(kind) ? draft.kinds : [...draft.kinds, kind],
    photoKinds: origin === 'photo' ? [...draft.photoKinds, kind] : draft.photoKinds,
    sources: sourceNo,
    lines: out,
    notes: note ? [...draft.notes, note] : draft.notes,
  };
}

export type LinePatch =
  | { type: 'ingredient'; ingredient: Ingredient; isNew: boolean }
  | { type: 'quantity'; amount?: string; unit?: string }
  | { type: 'on'; on: boolean };

/** One edit to one line. Editing an amount or unit makes it 'measured'; fixing a line that needed checking switches it on. */
export function updateLine(draft: Draft, key: string, patch: LinePatch, ingredients: Ingredient[]): Draft {
  const mode = draft.mode;
  const lines = draft.lines.map(prev => {
    if (prev.key !== key) return prev;
    const prevIng = ingredientOf(prev, ingredients);
    let next: DraftLine = prev;
    if (patch.type === 'on') {
      const allowed = patch.on ? checkLine(prev, prevIng, mode).ok : true;
      return allowed ? { ...prev, on: patch.on } : prev;
    }
    if (patch.type === 'ingredient') {
      const ing = patch.ingredient;
      const accepted = unitsFor(ing);
      const unitOk = accepted.includes(normaliseUnit(prev.unit) ?? prev.unit);
      next = {
        ...prev,
        ingredientId: ing.id,
        newIngredient: patch.isNew ? ing : null,
        unit: unitOk ? prev.unit : (quickAmounts(ing)[0]?.unit ?? accepted[0] ?? ''),
        amount: unitOk ? prev.amount : '',
        edited: true,
      };
      return { ...next, on: isReady(next, ing, mode) && !isReady(prev, prevIng, mode) ? true : next.on && checkLine(next, ing, mode).ok };
    }
    next = {
      ...prev,
      amount: patch.amount ?? prev.amount,
      unit: patch.unit ?? prev.unit,
      basis: 'measured',
      unsure: false,
      edited: true,
    };
    return { ...next, on: isReady(next, prevIng, mode) && !isReady(prev, prevIng, mode) ? true : next.on && checkLine(next, prevIng, mode).ok };
  });
  return { ...draft, lines };
}

/** Units the picker may show for a line: exactly those toBase accepts for its ingredient. */
export function unitOptions(ing: Ingredient | undefined): string[] {
  return ing ? unitsFor(ing) : [...KNOWN_UNITS];
}

const BASE_UNIT: Record<Dimension, string> = { mass: 'kg', volume: 'L', count: 'pc' };

/** An ingredient made in the review. Its id is unique among `existing`. */
export function makeNewIngredient(name: string, dimension: Dimension, existing: Ingredient[]): Ingredient {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New ingredient';
  const slug = clean.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Item';
  const taken = new Set(existing.map(i => i.id));
  let id = `Custom_${slug}`;
  for (let n = 2; taken.has(id); n++) id = `Custom_${slug}_${n}`;
  return { id, name: clean, aliases: [], dimension, displayUnit: BASE_UNIT[dimension], aisle: 'Other' };
}

export type BuildResult =
  | { ok: true; event: KitchenEvent; newIngredients: Ingredient[]; toast: string; count: number }
  | { ok: false; message: string };

/** Lines that will be saved: switched on and valid. */
export function includedLines(draft: Draft, ingredients: Ingredient[]): DraftLine[] {
  return draft.lines.filter(l => l.on && checkLine(l, ingredientOf(l, ingredients), draft.mode).ok);
}

/**
 * The ONE event this draft becomes. 'purchase' (source 'photo', or 'receipt' when a receipt
 * was read) has one movement per included line; 'set-stock' (pantry photos) has a setTo per
 * included line with delta = the difference from current stock. priceRs is the sum of the
 * included lines' receipt prices, or absent when there are none. The id is the draft's.
 */
export function buildDraftEvent(
  draft: Draft,
  ingredients: Ingredient[],
  stock: Map<string, Balance>,
  instant: Date,
  timeZone?: string,
): BuildResult {
  const included = includedLines(draft, ingredients);
  if (included.length === 0) return { ok: false, message: 'Switch on at least one line to save.' };
  const movements = included.map(line => {
    const ing = ingredientOf(line, ingredients)!;
    const c = checkLine(line, ing, draft.mode) as Extract<LineCheck, { ok: true }>;
    if (draft.mode === 'purchase') return { ingredientId: ing.id, delta: c.value, basis: line.basis };
    const was = stock.get(ing.id)?.amount ?? 0;
    return { ingredientId: ing.id, delta: round3(c.value - was), basis: line.basis, setTo: c.value };
  });
  const prices = included.map(l => l.priceRs).filter((p): p is number => p !== null);
  const priceRs = prices.length && draft.mode === 'purchase' ? round2(prices.reduce((a, b) => a + b, 0)) : undefined;
  const source = draft.photoKinds.length === 0 ? 'typed' : draft.photoKinds.includes('receipt') ? 'receipt' : 'photo';
  const event = makeEvent(draft.mode === 'purchase' ? 'purchase' : 'set-stock', movements, instant, {
    id: draft.eventId,
    source,
    ...(priceRs !== undefined ? { priceRs } : {}),
  }, timeZone);
  const seen = new Set<string>();
  const newIngredients = included
    .map(l => l.newIngredient)
    .filter((i): i is Ingredient => i !== null && !seen.has(i.id) && !!seen.add(i.id));
  const n = included.length;
  const from = source === 'receipt' ? 'receipt' : source === 'photo' ? 'photo' : 'list';
  const toast = draft.mode === 'purchase'
    ? `Added ${n} ${n === 1 ? 'item' : 'items'} from your ${from}. Pantry updated.`
    : `Updated ${n} ${n === 1 ? 'amount' : 'amounts'} from your ${from}.`;
  return { ok: true, event, newIngredients, toast, count: n };
}

/** Adds the event unless one with that id is already there, so saving twice changes nothing. */
export function appendEventOnce(events: KitchenEvent[], event: KitchenEvent): KitchenEvent[] {
  return events.some(e => e.id === event.id) ? events : [...events, event];
}
