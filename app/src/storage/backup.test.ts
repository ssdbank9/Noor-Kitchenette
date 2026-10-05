import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../domain/types';
import { BACKUP_APP, exportBackup, parseBackup, restoreBackup } from './backup';
import { loadKitchen, loadPreRestoreBackup, openKitchenDb, replaceAll, type KitchenDb } from './db';
import { testKitchen } from './testKitchen';

let opened: KitchenDb[] = [];
let dbCount = 0;

async function freshDb(): Promise<KitchenDb> {
  const db = await openKitchenDb(`backup-test-${++dbCount}`);
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened) db.close();
  opened = [];
});

/** A valid backup file as an object, to break one field at a time. */
function backupObject(): Record<string, any> {
  return JSON.parse(exportBackup(testKitchen(), new Date('2026-10-04T09:00:00.000Z')));
}

function errorsFor(file: unknown): string[] {
  const result = parseBackup(typeof file === 'string' ? file : JSON.stringify(file));
  if (result.ok) throw new Error('expected the backup to be rejected');
  return result.errors;
}

describe('export', () => {
  it('writes the app name, schema version, export time and all data', () => {
    const file = backupObject();
    expect(file.app).toBe(BACKUP_APP);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.exportedAt).toBe('2026-10-04T09:00:00.000Z');
    expect(file.settings).toEqual(testKitchen().settings);
    expect(file.ingredients).toHaveLength(3);
    expect(file.recipes).toHaveLength(2);
    expect(file.events).toHaveLength(3);
  });

  it('never includes secrets: drops any setting whose name has key or token', () => {
    const data = testKitchen();
    Object.assign(data.settings, { geminiKey: 'AIza-secret', apiToken: 'tok-secret', nested: { accessToken: 'x', ok: 1 } });
    const text = exportBackup(data);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('geminiKey');
    const file = JSON.parse(text);
    expect(file.settings).toEqual({ ...testKitchen().settings, nested: { ok: 1 } });
    expect(parseBackup(exportBackup(testKitchen())).ok).toBe(true);
  });

  it('round trips: parseBackup(exportBackup(data)) gives the same data', () => {
    expect(parseBackup(exportBackup(testKitchen()))).toEqual({ ok: true, data: testKitchen() });
  });
});

describe('parseBackup rejects malformed backups with useful errors', () => {
  it('bad JSON', () => {
    expect(errorsFor('{"app": "noors-kitchen", ')[0]).toMatch(/^The file is not valid JSON/);
  });

  it('not a backup object, or another app', () => {
    expect(errorsFor('[1, 2]')).toEqual(['The file is not a backup: expected a JSON object.']);
    expect(errorsFor({ ...backupObject(), app: 'other-app' })[0]).toContain("not a Noor's Kitchen backup");
    const v3 = { pantry: {}, recipes: [] }; // what a v3 backup looks like
    expect(errorsFor(v3)[0]).toContain("not a Noor's Kitchen backup");
  });

  it('wrong schemaVersion', () => {
    expect(errorsFor({ ...backupObject(), schemaVersion: SCHEMA_VERSION + 1 })[0])
      .toContain(`newer version of the app (schema version ${SCHEMA_VERSION + 1})`);
    expect(errorsFor({ ...backupObject(), schemaVersion: 0 })[0]).toContain('schemaVersion 0 is not a version this app knows');
    expect(errorsFor({ ...backupObject(), schemaVersion: '1' })[0]).toBe('schemaVersion must be a whole number, got "1".');
    const { schemaVersion: _, ...missing } = backupObject();
    expect(errorsFor(missing)[0]).toBe('schemaVersion must be a whole number, got nothing.');
  });

  it('missing fields', () => {
    const file = backupObject();
    delete file.recipes[1].name;
    delete file.events[0].localDate;
    delete file.settings;
    expect(errorsFor(file)).toEqual([
      'settings is missing.',
      'recipes[1].name is missing.',
      'events[0].localDate is missing.',
    ]);
  });

  it('a recipe ingredient that is not in the backup', () => {
    const file = backupObject();
    file.recipes[0].ingredients[1].ingredientId = 'Saffron';
    expect(errorsFor(file)).toEqual(['recipes[0].ingredients[1].ingredientId "Saffron" is not an ingredient in this backup.']);
  });

  it('a reversal of an event that is not in the backup', () => {
    const file = backupObject();
    file.events[2].reverses = 'e99';
    expect(errorsFor(file)).toEqual(['events[2].reverses "e99" is not an event in this backup.']);
  });

  it('reversal rules', () => {
    const file = backupObject();
    delete file.events[2].reverses;
    file.events[0].reverses = 'e2';
    expect(errorsFor(file)).toEqual([
      'events[0].reverses is only allowed on reversal events, not on a "purchase" event.',
      'events[2].reverses is missing (a reversal must name the event it undoes).',
    ]);
    const self = backupObject();
    self.events[2].reverses = 'e3';
    expect(errorsFor(self)).toEqual(['events[2].reverses names the reversal itself.']);
  });

  it('event kind, local date and local time', () => {
    const file = backupObject();
    file.events[0].kind = 'eat';
    file.events[0].localDate = '2026-02-30';
    file.events[1].localDate = '1/10/2026';
    file.events[1].localTime = '9:30';
    file.events[2].localTime = '24:00';
    expect(errorsFor(file)).toEqual([
      'events[0].kind must be one of purchase, cook, use, waste, set-stock, reversal; got "eat".',
      'events[0].localDate must be a date as YYYY-MM-DD, got "2026-02-30".',
      'events[1].localDate must be a date as YYYY-MM-DD, got "1/10/2026".',
      'events[1].localTime must be a time as HH:MM (00:00 to 23:59), got "9:30".',
      'events[2].localTime must be a time as HH:MM (00:00 to 23:59), got "24:00".',
    ]);
  });

  it('numbers that are not finite, or out of range', () => {
    const file = backupObject();
    file.recipes[0].serves = 0;
    file.recipes[0].version = 1.5;
    file.ingredients[0].minStock = -1;
    file.ingredients[0].conversions.cup = 0;
    const text = JSON.stringify(file).replace('"delta":1000', '"delta":1e999'); // parses as Infinity
    expect(errorsFor(text)).toEqual([
      'ingredients[0].minStock must be 0 or more, got -1.',
      'ingredients[0].conversions.cup must be more than 0, got 0.',
      'recipes[0].serves must be more than 0, got 0.',
      'recipes[0].version must be a whole number, got 1.5.',
      'events[0].movements[0].delta must be a finite number, got Infinity.',
    ]);
  });

  it('wrong types, unknown fields, unsafe links and time zones', () => {
    const file = backupObject();
    file.ingredients[1].aliases = 'anday';
    file.ingredients[2].colour = 'orange';
    file.recipes[0].videoUrl = 'javascript:alert(1)';
    file.recipes[1].personal = 'yes';
    file.events[1].meal.slot = 'midnight-snack';
    file.settings.timeZone = 'Mars/Olympus';
    file.events[0] = 'not an event';
    expect(errorsFor(file)).toEqual([
      'settings.timeZone must be a time zone such as Asia/Karachi, got "Mars/Olympus".',
      'ingredients[1].aliases must be a list, got "anday".',
      'ingredients[2].colour is not a field this app knows.',
      'recipes[0].videoUrl must be an http or https link, got "javascript:alert(1)".',
      'recipes[1].personal must be true or false, got "yes".',
      'events[0] must be an object, got "not an event".',
      'events[1].meal.slot must be one of breakfast, lunch, dinner, chai; got "midnight-snack".',
      'events[2].reverses "e1" is not an event in this backup.'.replace('"e1"', '"e2"').replace('e2" is', 'e2" is'),
    ].slice(0, 7));
  });

  it('repeated ids and a cook event without its meal', () => {
    const file = backupObject();
    file.ingredients[2].id = 'Eggs';
    delete file.events[1].meal;
    expect(errorsFor(file)).toEqual([
      'events[1].meal is missing (every cook event records its meal).',
      'ingredients[2].id "Eggs" is already used by ingredients[1].',
      'recipes[0].ingredients[0].ingredientId "Masoor_Daal" is not an ingredient in this backup.',
      'events[0].movements[0].ingredientId "Masoor_Daal" is not an ingredient in this backup.',
      'events[1].movements[0].ingredientId "Masoor_Daal" is not an ingredient in this backup.',
      'events[2].movements[0].ingredientId "Masoor_Daal" is not an ingredient in this backup.',
    ]);
  });

  it('cuts a very long error list short', () => {
    const file = backupObject();
    file.events = Array.from({ length: 80 }, () => ({}));
    const errors = errorsFor(file);
    expect(errors).toHaveLength(51);
    expect(errors[50]).toMatch(/^\.\.\.and \d+ more problems\.$/);
  });
});

describe('restoreBackup', () => {
  it('leaves the database unchanged when the backup is malformed', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const file = backupObject();
    file.events[2].reverses = 'e99';
    file.events = file.events.concat([]);

    const result = await restoreBackup(db, JSON.stringify(file));
    expect(result.ok).toBe(false);
    expect(await loadKitchen(db)).toEqual(testKitchen());
    expect(await loadPreRestoreBackup(db)).toBeNull();

    expect((await restoreBackup(db, 'not json')).ok).toBe(false);
    expect(await loadKitchen(db)).toEqual(testKitchen());
  });

  it('stores the current kitchen as the pre-restore copy, then replaces it', async () => {
    const db = await freshDb();
    const current = testKitchen();
    await replaceAll(db, current);

    const incoming = testKitchen();
    incoming.settings.householdName = 'Restored kitchen';
    incoming.events = incoming.events.slice(0, 1);
    const now = new Date('2026-10-04T10:15:00.000Z');
    const result = await restoreBackup(db, exportBackup(incoming), now);

    expect(result).toEqual({
      ok: true,
      data: incoming,
      previous: { takenAt: '2026-10-04T10:15:00.000Z', data: current },
    });
    expect(await loadPreRestoreBackup(db)).toEqual({ takenAt: '2026-10-04T10:15:00.000Z', data: current });
    expect(await loadKitchen(db)).toEqual(incoming);
  });

  it('keeps this phone\'s Gemini key when a backup (which never has one) is restored', async () => {
    const db = await freshDb();
    const current = testKitchen();
    current.settings.geminiKey = 'AIza-phone-key';
    await replaceAll(db, current);

    const incoming = testKitchen();
    incoming.settings.householdName = 'Restored kitchen';
    const file = exportBackup({ ...incoming, settings: { ...incoming.settings, geminiKey: 'AIza-other-key' } });
    expect(file).not.toContain('AIza');

    const result = await restoreBackup(db, file);
    expect(result.ok).toBe(true);
    const loaded = await loadKitchen(db);
    expect(loaded?.settings).toEqual({ ...incoming.settings, geminiKey: 'AIza-phone-key' });
  });

  it('round trips set-stock events with their setTo amount, including "not sure" (null)', () => {
    const data = testKitchen();
    data.events.push({
      id: 'e4', kind: 'set-stock', at: '2026-10-02T08:00:00.000Z', localDate: '2026-10-02', localTime: '13:00',
      timeZone: 'Asia/Karachi',
      movements: [
        { ingredientId: 'Eggs', delta: 6, basis: 'estimate', setTo: 6 },
        { ingredientId: 'Masoor_Daal', delta: 0, basis: 'unknown', setTo: null },
      ],
    });
    expect(parseBackup(exportBackup(data))).toEqual({ ok: true, data });
    const file = JSON.parse(exportBackup(data));
    file.events[3].movements[0].setTo = -1;
    expect(errorsFor(file)[0]).toContain('setTo');
  });

  it('exports and restores the chosen yes/no words', async () => {
    const data = testKitchen();
    data.settings.words = 'yes';
    expect(parseBackup(exportBackup(data))).toEqual({ ok: true, data });
    const file = backupObject();
    file.settings.words = 'maybe';
    expect(errorsFor(file)[0]).toContain('settings.words');
  });

  it('restores into an empty database', async () => {
    const db = await freshDb();
    const result = await restoreBackup(db, exportBackup(testKitchen()));
    expect(result).toMatchObject({ ok: true, previous: null });
    expect(await loadKitchen(db)).toEqual(testKitchen());
  });
});

import { seed as starter } from '../data/seed';
import { demoPantry as samplePantry } from '../data/demoPantry';
import { exportBackup as exportStarter, parseBackup as parseStarter } from './backup';

describe('a backup of the real starter data round-trips', () => {
  it('accepts every field the imported recipes and the sample pantry use (meals, setTo, category, links)', () => {
    const data = { ...starter, events: samplePantry };
    const parsed = parseStarter(exportStarter(data));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    if (parsed.ok) expect(parsed.data.recipes.find(r => r.id === 'R016')?.meals).toEqual(['breakfast', 'lunch', 'dinner']);
  });
});

describe('personal recipes round-trip (F40)', () => {
  const own = {
    id: 'U-0a1b2c3d',
    name: 'My test dish',
    serves: 3,
    time: '30 min',
    notes: 'Less salt.',
    category: 'My recipes',
    meals: ['lunch', 'chai'] as ('lunch' | 'chai')[],
    writtenUrl: 'https://example.com/dish',
    videoUrl: 'https://www.youtube.com/watch?v=abc',
    aliases: ['mera dish', 'test'],
    source: { url: 'https://example.com/source', name: 'Example', checkedOn: '2026-10-01' },
    ingredients: [{ ingredientId: 'Eggs', amount: 2.5, unit: 'pc' }, { ingredientId: 'Masoor_Daal', amount: 250, unit: 'g', optional: true }],
    steps: ['Beat the eggs.', 'Fry gently.'],
    version: 3,
    personal: true,
  };

  it('keeps steps, aliases, source, meals, links and version through export, parse and restore', async () => {
    const data = testKitchen();
    data.recipes.push(own);
    expect(parseBackup(exportBackup(data))).toEqual({ ok: true, data });
    const db = await freshDb();
    expect((await restoreBackup(db, exportBackup(data))).ok).toBe(true);
    expect((await loadKitchen(db))?.recipes.find(r => r.id === own.id)).toEqual(own);
  });
});
