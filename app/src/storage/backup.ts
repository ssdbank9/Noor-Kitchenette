// Backup files: export, validate, restore (F45, F46, F74).
// v3's restore only checked that the file had a "pantry" field, then replaced everything
// with it and kept no copy of what was there. Here every field is checked by hand before
// anything is replaced, files from older schema versions go through MIGRATIONS first, and
// the current kitchen is kept in the database as 'pre-restore-backup' in the same
// transaction that replaces it. A file that does not validate changes nothing.

import {
  SCHEMA_VERSION,
  type Dimension,
  type EventKind,
  type Ingredient,
  type KitchenData,
  type KitchenEvent,
  type MealRating,
  type MealRecord,
  type MealSlot,
  type Movement,
  type QuantityBasis,
  type Recipe,
  type RecipeIngredient,
} from '../domain/types';
import { replaceAllKeepingCopy, type KitchenDb, type KitchenSettings, type PreRestoreBackup } from './db';
import { describeError } from './saveQueue';

/** Written into every backup so a file from another app is refused. */
export const BACKUP_APP = 'noors-kitchen';
/** Longer error lists are cut to this many, plus a count of the rest. */
const MAX_ERRORS = 50;

export type ParseResult = { ok: true; data: KitchenData } | { ok: false; errors: string[] };
export type RestoreResult =
  | { ok: true; data: KitchenData; previous: PreRestoreBackup | null }
  | { ok: false; errors: string[] };

type Fields = Record<string, unknown>;

/**
 * Upgrades a backup file from schema version `n` (the key) to `n + 1`. Add one entry each
 * time SCHEMA_VERSION goes up; parseBackup chains them from the file's version to the
 * current one, then validates the result as the current version. None exist yet.
 */
const MIGRATIONS: Record<number, (file: Fields) => Fields> = {};

/** The backup file for `data`: JSON with the app name, schema version and export time. */
export function exportBackup(data: KitchenData, exportedAt: Date = new Date()): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      schemaVersion: data.schemaVersion,
      exportedAt: exportedAt.toISOString(),
      settings: withoutSecrets(data.settings),
      ingredients: data.ingredients,
      recipes: data.recipes,
      events: data.events,
    },
    null,
    2,
  );
}

/**
 * A copy of `value` without any property whose name contains 'key' or 'token' (any case),
 * at any depth. Settings may later hold a Gemini API key (settings.geminiKey); a backup
 * file gets shared and must never carry it. Matching on the name also catches future ones.
 */
export function withoutSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutSecrets) as T;
  if (!isFields(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name]) => !/key|token/i.test(name))
      .map(([name, v]) => [name, withoutSecrets(v)]),
  ) as T;
}

/** Checks every field of a backup file. Errors name the field, e.g. `recipes[3].serves must be more than 0.` */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`The file is not valid JSON: ${describeError(error)}`] };
  }
  if (!isFields(raw)) return { ok: false, errors: ['The file is not a backup: expected a JSON object.'] };
  if (raw.app !== BACKUP_APP) {
    return { ok: false, errors: [`The file is not a Noor's Kitchen backup: app is ${show(raw.app)}, expected "${BACKUP_APP}".`] };
  }
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, errors: [`schemaVersion must be a whole number, got ${show(version)}.`] };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`The backup is from a newer version of the app (schema version ${version}); this app reads up to version ${SCHEMA_VERSION}.`],
    };
  }
  let file = raw;
  for (let from = version; from < SCHEMA_VERSION; from++) {
    const migrate = MIGRATIONS[from];
    if (!migrate) {
      return { ok: false, errors: [`schemaVersion ${version} is not a version this app knows (it reads version ${SCHEMA_VERSION}).`] };
    }
    try {
      file = { ...migrate(file), schemaVersion: from + 1 };
    } catch (error) {
      return { ok: false, errors: [`The backup could not be upgraded from schema version ${from}: ${describeError(error)}`] };
    }
  }
  return validate(file);
}

/**
 * Restores a backup file. If it does not validate, nothing changes and the errors are
 * returned. If it does, one transaction stores the current kitchen as 'pre-restore-backup'
 * (with the time) and then replaces everything. Database failures are thrown; the
 * transaction is then rolled back and the current kitchen is untouched.
 */
export async function restoreBackup(db: KitchenDb, text: string, now: Date = new Date()): Promise<RestoreResult> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  // The Gemini key lives only on this phone and is never in a backup (D-08): keep the current one.
  const current = await db.get('meta', 'settings');
  const geminiKey = (current as KitchenSettings | undefined)?.geminiKey;
  const data = geminiKey ? { ...parsed.data, settings: { ...parsed.data.settings, geminiKey } } : parsed.data;
  const previous = await replaceAllKeepingCopy(db, data, now);
  return { ok: true, data, previous };
}

const DIMENSIONS: readonly Dimension[] = ['mass', 'volume', 'count'];
const BASES: readonly QuantityBasis[] = ['measured', 'estimate', 'unknown'];
const EVENT_KINDS: readonly EventKind[] = ['purchase', 'cook', 'use', 'waste', 'set-stock', 'reversal'];
const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'chai'];
const MEAL_RATINGS: readonly MealRating[] = ['loved', 'ok', 'not-again'];
const SOURCES: readonly NonNullable<KitchenEvent['source']>[] = ['typed', 'photo', 'receipt', 'recipe'];

const FILE_FIELDS = ['app', 'schemaVersion', 'exportedAt', 'settings', 'ingredients', 'recipes', 'events'] as const;
const SETTINGS_FIELDS = ['householdName', 'timeZone', 'defaultServings', 'slotTimes', 'words'] as const;
const WORD_CHOICES = ['haan', 'jee', 'yes'] as const;
const INGREDIENT_FIELDS = ['id', 'name', 'aliases', 'dimension', 'displayUnit', 'aisle', 'minStock', 'conversions'] as const;
const RECIPE_FIELDS = [
  'id', 'name', 'serves', 'time', 'notes', 'category', 'writtenUrl', 'videoUrl', 'recommendedWrittenUrl',
  'recommendedVideoUrl', 'meals', 'aliases', 'source', 'ingredients', 'steps', 'version', 'personal',
] as const;
const RECIPE_INGREDIENT_FIELDS = ['ingredientId', 'amount', 'unit', 'optional'] as const;
const EVENT_FIELDS = [
  'id', 'kind', 'at', 'localDate', 'localTime', 'timeZone', 'movements', 'meal', 'reverses', 'source', 'note', 'priceRs',
] as const;
const MOVEMENT_FIELDS = ['ingredientId', 'delta', 'basis', 'setTo'] as const;
const MEAL_FIELDS = ['recipeId', 'recipeName', 'recipeVersion', 'slot', 'servings', 'rating'] as const;

function validate(file: Fields): ParseResult {
  const c = new Checker();
  c.record(file, '', FILE_FIELDS, () => undefined);
  c.instant(file.exportedAt, 'exportedAt');

  const settings = readSettings(c, file.settings, 'settings');
  const ingredients = c.list(file.ingredients, 'ingredients').map((v, i) => readIngredient(c, v, `ingredients[${i}]`));
  const recipes = c.list(file.recipes, 'recipes').map((v, i) => readRecipe(c, v, `recipes[${i}]`));
  const events = c.list(file.events, 'events').map((v, i) => readEvent(c, v, `events[${i}]`));

  const ingredientIds = c.uniqueIds(ingredients, 'ingredients');
  const recipeIds = c.uniqueIds(recipes, 'recipes');
  const eventIds = c.uniqueIds(events, 'events');

  recipes.forEach((recipe, i) => recipe.ingredients.forEach((line, j) => {
    if (line.ingredientId && !ingredientIds.has(line.ingredientId)) {
      c.report(`recipes[${i}].ingredients[${j}].ingredientId`, `"${line.ingredientId}" is not an ingredient in this backup.`);
    }
  }));
  events.forEach((event, i) => {
    const path = `events[${i}]`;
    event.movements.forEach((movement, j) => {
      if (movement.ingredientId && !ingredientIds.has(movement.ingredientId)) {
        c.report(`${path}.movements[${j}].ingredientId`, `"${movement.ingredientId}" is not an ingredient in this backup.`);
      }
    });
    if (event.meal?.recipeId && !recipeIds.has(event.meal.recipeId)) {
      c.report(`${path}.meal.recipeId`, `"${event.meal.recipeId}" is not a recipe in this backup.`);
    }
    if (event.kind === 'reversal' && event.reverses) {
      if (event.reverses === event.id) c.report(`${path}.reverses`, 'names the reversal itself.');
      else if (!eventIds.has(event.reverses)) c.report(`${path}.reverses`, `"${event.reverses}" is not an event in this backup.`);
    }
  });

  if (c.errors.length > 0) {
    const errors = c.errors.length > MAX_ERRORS
      ? [...c.errors.slice(0, MAX_ERRORS), `...and ${c.errors.length - MAX_ERRORS} more problems.`]
      : c.errors;
    return { ok: false, errors };
  }
  return { ok: true, data: { schemaVersion: SCHEMA_VERSION, ingredients, recipes, events, settings } };
}

function readSettings(c: Checker, value: unknown, path: string): KitchenSettings {
  return c.record(value, path, SETTINGS_FIELDS, o => withoutUndefined({
    words: optional(o.words, v => c.oneOf(v, `${path}.words`, WORD_CHOICES)),
    householdName: c.text(o.householdName, `${path}.householdName`),
    timeZone: c.timeZone(o.timeZone, `${path}.timeZone`),
    defaultServings: c.number(o.defaultServings, `${path}.defaultServings`, { above: 0 }),
    slotTimes: c.record(o.slotTimes, `${path}.slotTimes`, MEAL_SLOTS, times => ({
      breakfast: c.clock(times.breakfast, `${path}.slotTimes.breakfast`),
      lunch: c.clock(times.lunch, `${path}.slotTimes.lunch`),
      dinner: c.clock(times.dinner, `${path}.slotTimes.dinner`),
      chai: c.clock(times.chai, `${path}.slotTimes.chai`),
    })),
  }));
}

function readIngredient(c: Checker, value: unknown, path: string): Ingredient {
  return c.record(value, path, INGREDIENT_FIELDS, o => withoutUndefined({
    id: c.text(o.id, `${path}.id`, { nonEmpty: true }),
    name: c.text(o.name, `${path}.name`, { nonEmpty: true }),
    aliases: c.list(o.aliases, `${path}.aliases`).map((v, i) => c.text(v, `${path}.aliases[${i}]`, { nonEmpty: true })),
    dimension: c.oneOf(o.dimension, `${path}.dimension`, DIMENSIONS),
    displayUnit: c.text(o.displayUnit, `${path}.displayUnit`, { nonEmpty: true }),
    aisle: c.text(o.aisle, `${path}.aisle`),
    minStock: optional(o.minStock, v => c.number(v, `${path}.minStock`, { min: 0 })),
    conversions: optional(o.conversions, v => c.conversions(v, `${path}.conversions`)),
  }));
}

function readRecipe(c: Checker, value: unknown, path: string): Recipe {
  return c.record(value, path, RECIPE_FIELDS, o => withoutUndefined({
    id: c.text(o.id, `${path}.id`, { nonEmpty: true }),
    name: c.text(o.name, `${path}.name`, { nonEmpty: true }),
    serves: c.number(o.serves, `${path}.serves`, { above: 0 }),
    time: c.text(o.time, `${path}.time`),
    notes: c.text(o.notes, `${path}.notes`),
    category: optional(o.category, v => c.text(v, `${path}.category`)),
    writtenUrl: optional(o.writtenUrl, v => c.webLink(v, `${path}.writtenUrl`)),
    videoUrl: optional(o.videoUrl, v => c.webLink(v, `${path}.videoUrl`)),
    recommendedWrittenUrl: optional(o.recommendedWrittenUrl, v => c.webLink(v, `${path}.recommendedWrittenUrl`)),
    recommendedVideoUrl: optional(o.recommendedVideoUrl, v => c.webLink(v, `${path}.recommendedVideoUrl`)),
    meals: optional(o.meals, v => c.list(v, `${path}.meals`).map((m, i) => c.oneOf(m, `${path}.meals[${i}]`, MEAL_SLOTS))),
    aliases: optional(o.aliases, v => c.list(v, `${path}.aliases`).map((a, i) => c.text(a, `${path}.aliases[${i}]`))),
    source: optional(o.source, v => c.record(v, `${path}.source`, ['url', 'name', 'checkedOn'], s => withoutUndefined({
      url: c.webLink(s.url, `${path}.source.url`),
      name: optional(s.name, n => c.text(n, `${path}.source.name`)),
      checkedOn: c.text(s.checkedOn, `${path}.source.checkedOn`, { nonEmpty: true }),
    }))),
    ingredients: c.list(o.ingredients, `${path}.ingredients`)
      .map((v, i) => readRecipeIngredient(c, v, `${path}.ingredients[${i}]`)),
    steps: optional(o.steps, v => c.list(v, `${path}.steps`).map((s, i) => c.text(s, `${path}.steps[${i}]`))),
    version: c.number(o.version, `${path}.version`, { integer: true, min: 1 }),
    personal: optional(o.personal, v => c.flag(v, `${path}.personal`)),
  }));
}

function readRecipeIngredient(c: Checker, value: unknown, path: string): RecipeIngredient {
  return c.record(value, path, RECIPE_INGREDIENT_FIELDS, o => withoutUndefined({
    ingredientId: c.text(o.ingredientId, `${path}.ingredientId`, { nonEmpty: true }),
    amount: c.number(o.amount, `${path}.amount`, { min: 0 }),
    unit: c.text(o.unit, `${path}.unit`, { nonEmpty: true }),
    optional: optional(o.optional, v => c.flag(v, `${path}.optional`)),
  }));
}

function readEvent(c: Checker, value: unknown, path: string): KitchenEvent {
  return c.record(value, path, EVENT_FIELDS, o => {
    // Rules that depend on the kind, checked only when the kind itself is valid.
    if (o.kind === 'cook' && o.meal === undefined) c.report(`${path}.meal`, 'is missing (every cook event records its meal).');
    if (o.kind === 'reversal' && o.reverses === undefined) {
      c.report(`${path}.reverses`, 'is missing (a reversal must name the event it undoes).');
    }
    if (o.kind !== 'reversal' && EVENT_KINDS.includes(o.kind as EventKind) && o.reverses !== undefined) {
      c.report(`${path}.reverses`, `is only allowed on reversal events, not on a "${String(o.kind)}" event.`);
    }
    return withoutUndefined({
      id: c.text(o.id, `${path}.id`, { nonEmpty: true }),
      kind: c.oneOf(o.kind, `${path}.kind`, EVENT_KINDS),
      at: c.instant(o.at, `${path}.at`),
      localDate: c.calendarDate(o.localDate, `${path}.localDate`),
      localTime: c.clock(o.localTime, `${path}.localTime`),
      timeZone: c.timeZone(o.timeZone, `${path}.timeZone`),
      movements: c.list(o.movements, `${path}.movements`).map((v, i) => readMovement(c, v, `${path}.movements[${i}]`)),
      meal: optional(o.meal, v => readMeal(c, v, `${path}.meal`)),
      reverses: optional(o.reverses, v => c.text(v, `${path}.reverses`, { nonEmpty: true })),
      source: optional(o.source, v => c.oneOf(v, `${path}.source`, SOURCES)),
      note: optional(o.note, v => c.text(v, `${path}.note`)),
      priceRs: optional(o.priceRs, v => c.number(v, `${path}.priceRs`, { min: 0 })),
    });
  });
}

function readMovement(c: Checker, value: unknown, path: string): Movement {
  return c.record(value, path, MOVEMENT_FIELDS, o => withoutUndefined({
    ingredientId: c.text(o.ingredientId, `${path}.ingredientId`, { nonEmpty: true }),
    delta: c.number(o.delta, `${path}.delta`),
    basis: c.oneOf(o.basis, `${path}.basis`, BASES),
    // set-stock events: the amount Noor said is there (null = not sure).
    setTo: o.setTo === null ? null : optional(o.setTo, v => c.number(v, `${path}.setTo`, { min: 0 })),
  }));
}

function readMeal(c: Checker, value: unknown, path: string): MealRecord {
  return c.record(value, path, MEAL_FIELDS, o => withoutUndefined({
    recipeId: c.text(o.recipeId, `${path}.recipeId`, { nonEmpty: true }),
    recipeName: optional(o.recipeName, v => c.text(v, `${path}.recipeName`)),
    recipeVersion: c.number(o.recipeVersion, `${path}.recipeVersion`, { integer: true, min: 1 }),
    slot: c.oneOf(o.slot, `${path}.slot`, MEAL_SLOTS),
    servings: c.number(o.servings, `${path}.servings`, { above: 0 }),
    rating: optional(o.rating, v => c.oneOf(v, `${path}.rating`, MEAL_RATINGS)),
  }));
}

/**
 * Field checks that collect every problem instead of stopping at the first. Each returns a
 * value of the right type even when the input is wrong (and reports it), so the readers can
 * build whole objects; parseBackup uses them only when no problem was reported.
 */
class Checker {
  readonly errors: string[] = [];
  private readonly zones = new Map<string, boolean>();
  private muted = 0;

  report(path: string, message: string): void {
    if (this.muted === 0) this.errors.push(`${path} ${message}`);
  }

  /**
   * Reads an object with `read`, reporting any field not in `known`. When `value` is not an
   * object that is reported once, and `read` runs on {} without reporting its fields again.
   */
  record<T>(value: unknown, path: string, known: readonly string[], read: (fields: Fields) => T): T {
    if (!isFields(value)) {
      this.report(path, value === undefined ? 'is missing.' : `must be an object, got ${show(value)}.`);
      this.muted++;
      try {
        return read({});
      } finally {
        this.muted--;
      }
    }
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) this.report(path ? `${path}.${key}` : key, 'is not a field this app knows.');
    }
    return read(value);
  }

  list(value: unknown, path: string): unknown[] {
    if (Array.isArray(value)) return value;
    this.report(path, value === undefined ? 'is missing.' : `must be a list, got ${show(value)}.`);
    return [];
  }

  text(value: unknown, path: string, rule: { nonEmpty?: boolean } = {}): string {
    if (typeof value !== 'string') {
      this.report(path, value === undefined ? 'is missing.' : `must be text, got ${show(value)}.`);
      return '';
    }
    if (rule.nonEmpty && value.trim() === '') this.report(path, 'must not be empty.');
    return value;
  }

  number(value: unknown, path: string, rule: { integer?: boolean; min?: number; above?: number } = {}): number {
    if (typeof value !== 'number') {
      this.report(path, value === undefined ? 'is missing.' : `must be a number, got ${show(value)}.`);
      return 0;
    }
    if (!Number.isFinite(value)) this.report(path, `must be a finite number, got ${show(value)}.`);
    else if (rule.integer && !Number.isInteger(value)) this.report(path, `must be a whole number, got ${value}.`);
    else if (rule.min !== undefined && value < rule.min) this.report(path, `must be ${rule.min} or more, got ${value}.`);
    else if (rule.above !== undefined && value <= rule.above) this.report(path, `must be more than ${rule.above}, got ${value}.`);
    return value;
  }

  flag(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') this.report(path, `must be true or false, got ${show(value)}.`);
    return value === true;
  }

  oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
    this.report(path, value === undefined ? 'is missing.' : `must be one of ${allowed.join(', ')}; got ${show(value)}.`);
    return allowed[0];
  }

  /** YYYY-MM-DD and a real day of the calendar. */
  calendarDate(value: unknown, path: string): string {
    const text = this.text(value, path);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const real = match !== null && isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (typeof value === 'string' && !real) this.report(path, `must be a date as YYYY-MM-DD, got ${show(value)}.`);
    return text;
  }

  /** HH:MM, 24-hour. */
  clock(value: unknown, path: string): string {
    const text = this.text(value, path);
    if (typeof value === 'string' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
      this.report(path, `must be a time as HH:MM (00:00 to 23:59), got ${show(value)}.`);
    }
    return text;
  }

  /** An ISO 8601 instant with a zone, e.g. 2026-10-04T07:30:00.000Z. */
  instant(value: unknown, path: string): string {
    const text = this.text(value, path);
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
    if (typeof value === 'string' && !(iso.test(text) && Number.isFinite(Date.parse(text)))) {
      this.report(path, `must be a date and time like 2026-10-04T07:30:00.000Z, got ${show(value)}.`);
    }
    return text;
  }

  /** An IANA time zone this device knows, e.g. Asia/Karachi. */
  timeZone(value: unknown, path: string): string {
    const text = this.text(value, path, { nonEmpty: true });
    if (typeof value === 'string' && text.trim() !== '' && !this.knownZone(text)) {
      this.report(path, `must be a time zone such as Asia/Karachi, got ${show(value)}.`);
    }
    return text;
  }

  /** An http or https address (anything else could run code when opened as a link). */
  webLink(value: unknown, path: string): string {
    const text = this.text(value, path);
    if (typeof value === 'string' && !isWebLink(text)) this.report(path, `must be an http or https link, got ${show(value)}.`);
    return text;
  }

  /** { unit: base units per one of that unit }, each above 0. */
  conversions(value: unknown, path: string): Record<string, number> {
    if (!isFields(value)) {
      this.report(path, `must be an object of unit: amount, got ${show(value)}.`);
      return {};
    }
    // fromEntries defines own keys, so a key such as "__proto__" cannot change the prototype.
    return Object.fromEntries(Object.entries(value).map(([unit, amount]) => {
      if (unit.trim() === '') this.report(path, 'has an empty unit name.');
      return [unit, this.number(amount, `${path}.${unit}`, { above: 0 })];
    }));
  }

  /** The set of ids; reports repeats. */
  uniqueIds(items: { id: string }[], path: string): Set<string> {
    const firstIndex = new Map<string, number>();
    items.forEach(({ id }, i) => {
      if (id === '') return; // already reported as missing or empty
      const first = firstIndex.get(id);
      if (first === undefined) firstIndex.set(id, i);
      else this.report(`${path}[${i}].id`, `"${id}" is already used by ${path}[${first}].`);
    });
    return new Set(firstIndex.keys());
  }

  private knownZone(zone: string): boolean {
    let known = this.zones.get(zone);
    if (known === undefined) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        known = true;
      } catch {
        known = false; // RangeError: not a time zone; reported by the caller
      }
      this.zones.set(zone, known);
    }
    return known;
  }
}

function optional<T>(value: unknown, read: (value: unknown) => T): T | undefined {
  return value === undefined ? undefined : read(value);
}

/** Leaves optional fields out instead of storing them as undefined. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isWebLink(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false; // not a URL at all; reported by the caller
  }
}

/** A value as it appears in the file, shortened for an error message. */
function show(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (typeof value === 'number') return String(value);
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}
