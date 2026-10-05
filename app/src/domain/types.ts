// Shared data model for Noor's Kitchen (docs/PLAN.md section 3).
// Every change to the kitchen is a KitchenEvent; pantry balances are derived from the
// movements of events that have not been reversed. Amounts inside movements are always in
// the ingredient's base unit: grams (mass), millilitres (volume) or pieces (count).

export type Dimension = 'mass' | 'volume' | 'count';
export type BaseUnit = 'g' | 'ml' | 'pc';

/** measured: weighed or counted; estimate: Noor's guess; unknown: "not sure" (never zero). */
export type QuantityBasis = 'measured' | 'estimate' | 'unknown';

export interface Quantity {
  /** null only when basis is 'unknown'. */
  amount: number | null;
  /** As entered or displayed: 'g', 'kg', 'ml', 'L', 'pc', 'tsp', 'cup', 'packet', 'pao', 'dozen', ... */
  unit: string;
  basis: QuantityBasis;
}

export interface Ingredient {
  /** Stable id from the workbooks, e.g. 'Masoor_Daal'. Never reused. */
  id: string;
  name: string;
  /** Other names and spellings, including Urdu/Roman Urdu (F69). */
  aliases: string[];
  dimension: Dimension;
  /** Unit shown to Noor by default, e.g. 'kg', 'g', 'pc', 'bunch'. */
  displayUnit: string;
  /** Shopping aisle / category, e.g. 'Produce'. */
  aisle: string;
  /** Restock below this many base units (F23). */
  minStock?: number;
  /**
   * Household units that are not plain metric for this ingredient, as base units per one
   * of that unit: { cup: 200 } for rice in grams, { packet: 400 }, { bunch: 1 } in pieces.
   * A unit with no rule here and no metric conversion is refused, never guessed (F58).
   */
  conversions?: Record<string, number>;
}

export interface RecipeIngredient {
  ingredientId: string;
  amount: number;
  unit: string;
  optional?: boolean;
}

export interface Recipe {
  /** Stable id from the workbooks, e.g. 'R001', 'R006c'. */
  id: string;
  name: string;
  /** Servings the amounts are written for. */
  serves: number;
  time: string;
  notes: string;
  category?: string;
  /** Meal slots this dish suits; missing means any slot. */
  meals?: MealSlot[];
  /** Links kept from the workbooks (F13, F14). */
  writtenUrl?: string;
  videoUrl?: string;
  /** Best-rated links from docs/RECIPE_SOURCES.md (F78), when different. */
  recommendedWrittenUrl?: string;
  recommendedVideoUrl?: string;
  ingredients: RecipeIngredient[];
  steps?: string[];
  /** Other names and spellings, e.g. 'korma' for Qorma, so a lookup finds this dish first (F80). */
  aliases?: string[];
  /** Where a recipe found online came from, and when it was checked (F78, F80). */
  source?: { url: string; name?: string; checkedOn: string };
  /** Bumped on every edit; cooking events keep the version they used (F63). */
  version: number;
  /** true for recipes Noor added herself. */
  personal?: boolean;
}

export interface Movement {
  ingredientId: string;
  /** Signed change in the ingredient's base unit. */
  delta: number;
  basis: QuantityBasis;
  /**
   * On 'set-stock' events: the amount Noor says is there now, in base units (null when she
   * is not sure). It replaces everything before it, so undoing an older purchase later does
   * not change a balance she has since confirmed. delta then records the difference seen.
   */
  setTo?: number | null;
}

export type EventKind =
  | 'purchase'   // bought; adds stock
  | 'cook'       // cooked a meal; uses stock and counts in history
  | 'use'        // everyday use, e.g. chai (F62)
  | 'waste'      // thrown away (F68)
  | 'set-stock'  // "set remaining amount" correction (F56)
  | 'reversal';  // undoes another event and all its effects (F43)

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'chai';
export type MealRating = 'loved' | 'ok' | 'not-again';

export interface MealRecord {
  recipeId: string;
  /** The dish's name when it was cooked, so renaming or deleting the recipe never rewrites history. */
  recipeName?: string;
  recipeVersion: number;
  slot: MealSlot;
  servings: number;
  rating?: MealRating;
}

export interface KitchenEvent {
  id: string;
  kind: EventKind;
  /** UTC instant it happened (a meal's time). History is ordered by this. */
  at: string;
  /**
   * UTC instant the entry was made. Stock is applied in the order entries were recorded, so a
   * meal saved now but dated earlier (a backdated or default slot time) is never lost behind a
   * stock check made in between. Missing on older entries and means "same as at".
   */
  recordedAt?: string;
  /** Household-local calendar date, YYYY-MM-DD (D5). */
  localDate: string;
  /** Household-local time, HH:MM. */
  localTime: string;
  timeZone: string;
  movements: Movement[];
  /** Present on 'cook' events. */
  meal?: MealRecord;
  /** On a 'reversal', the id of the event it undoes. */
  reverses?: string;
  /** Where the entry came from (F28). */
  source?: 'typed' | 'photo' | 'receipt' | 'recipe';
  note?: string;
  /** Optional price paid, in rupees (F72). */
  priceRs?: number;
}

// ---------- Planning, leftovers, storage and eating out (updates 2) ----------

/** Where food is kept (F66). */
export type StorageLocation = 'fridge' | 'freezer' | 'shelf' | 'counter';

/**
 * One thing on a planned meal. Planning never changes stock; only cooking or using it does.
 * - dish: cooked at home from a recipe; `cookedEventId` links to the cook event once done.
 * - eatout: eating out replaces cooking, so nothing is deducted.
 * - leftover: eating prepared food, so the raw ingredients are NOT deducted again.
 */
export type PlanItem =
  | { kind: 'dish'; recipeId: string; recipeName: string; cookedEventId?: string }
  | { kind: 'eatout'; label: string; favouriteId?: string }
  | { kind: 'leftover'; leftoverId: string; label: string; portions: number; usedOn?: string };

export interface PlannedMeal {
  id: string;
  /** Household-local date, YYYY-MM-DD. */
  localDate: string;
  slot: MealSlot;
  /** People eating; each dish is scaled to this. */
  servings: number;
  /** Several dishes can share one meal. */
  items: PlanItem[];
  status: 'planned' | 'cancelled';
  note?: string;
}

/** Prepared food kept for later (F65). Using it never deducts raw ingredients again. */
export interface Leftover {
  id: string;
  name: string;
  recipeId?: string;
  /** The cook event it came from, when known. */
  fromEventId?: string;
  portionsMade: number;
  portionsLeft: number;
  /** Household-local dates, YYYY-MM-DD. */
  madeOn: string;
  location: StorageLocation;
  frozenOn?: string;
  useBy?: string;
  log: { at: string; localDate: string; kind: 'made' | 'used' | 'wasted' | 'frozen' | 'moved'; portions: number; note?: string }[];
  note?: string;
}

/**
 * A bought package or batch of one ingredient with its own place and dates (F66, F67, F76).
 * Amounts are in base units. Stock totals still come from the event log; batches only say
 * where things are and what to use first (oldest consumed first).
 */
export interface Batch {
  id: string;
  ingredientId: string;
  amount: number;
  location: StorageLocation;
  boughtOn?: string;
  expiresOn?: string;
  frozenOn?: string;
  /** The size printed on the package, never "what remains" (F28). */
  packageSize?: { amount: number; unit: string };
  fromEventId?: string;
  note?: string;
}

/** A dine-out favourite: a dish at a place (F83). */
export interface Favourite {
  id: string;
  dish: string;
  place: string;
  area?: string;
  /** The restaurant's foodpanda link, when saved. */
  url?: string;
  /** Mood words it fits, e.g. 'Pizza', 'Karahi'. */
  moods: string[];
  lastOrderedOn?: string;
  note?: string;
}

export interface KitchenData {
  schemaVersion: number;
  ingredients: Ingredient[];
  recipes: Recipe[];
  events: KitchenEvent[];
  /** Optional so older saves and backups keep working; treat missing as empty. */
  plan?: PlannedMeal[];
  leftovers?: Leftover[];
  batches?: Batch[];
  favourites?: Favourite[];
  settings: {
    householdName: string;
    timeZone: string;
    defaultServings: number;
    slotTimes: Record<MealSlot, string>;
    /** Yes/no words shown on buttons (Settings). Missing means Haan / Nahi. */
    words?: 'haan' | 'jee' | 'yes';
    /** Gemini key (D-08): stays on this phone, never exported in a backup. */
    geminiKey?: string;
  };
}

export const SCHEMA_VERSION = 1;
