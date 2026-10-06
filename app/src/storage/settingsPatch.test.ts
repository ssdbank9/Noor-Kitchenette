import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { applySettingsPatch } from './settingsPatch';
import { loadKitchen, openKitchenDb, replaceAll, saveSettingsPatch, type KitchenDb } from './db';
import { testKitchen } from './testKitchen';
import type { KitchenData } from '../domain/types';

// Regression tests for the two findings in audit/glm-2026-10-06-review.md: a settings clear must
// survive the JSON localStorage mirror (N1), and a nested slot-time edit must not overwrite a
// different slot changed elsewhere (N3).

type Settings = KitchenData['settings'];
const base = (): Settings => testKitchen().settings;

describe('settings patch', () => {
  it('keeps a removal through the JSON mirror (N1)', () => {
    // The op the app now queues for "Remove key" / "Area cleared": an explicit `remove`.
    const op = { type: 'settingsPatch', patch: {}, remove: ['geminiKey', 'homeArea'] };
    const mirrored = JSON.parse(JSON.stringify(op)) as typeof op;
    const current = { ...base(), geminiKey: 'AIza-secret', homeArea: { label: 'x', lat: 1, lng: 2 } };
    const next = applySettingsPatch(current, mirrored);
    expect(next).not.toHaveProperty('geminiKey');
    expect(next).not.toHaveProperty('homeArea');
  });

  it('also deletes a key sent as undefined, for an old pending operation', () => {
    const next = applySettingsPatch({ ...base(), geminiKey: 'k' }, { patch: { geminiKey: undefined } });
    expect(next).not.toHaveProperty('geminiKey');
  });

  it('merges a partial slot-time edit and keeps the other slots (N3)', () => {
    const start = base();
    const first = applySettingsPatch(start, { patch: { slotTimes: { lunch: '14:00' } } });
    const second = applySettingsPatch(first, { patch: { slotTimes: { breakfast: '08:15' } } });
    expect(second.slotTimes).toEqual({ ...start.slotTimes, lunch: '14:00', breakfast: '08:15' });
  });

  it('ignores a nested undefined so memory and the mirror agree (F1)', () => {
    const start = { ...base(), slotTimes: { breakfast: '08:30', lunch: '13:30', chai: '17:00', dinner: '20:00' } };
    const direct = applySettingsPatch(start, { patch: { slotTimes: { lunch: undefined } } });
    expect(direct.slotTimes.lunch).toBe('13:30');
    // The mirror drops the nested undefined before it is sent; the result must be the same.
    const mirrored = JSON.parse(JSON.stringify({ slotTimes: { lunch: undefined } })) as { slotTimes: Record<string, string> };
    const viaMirror = applySettingsPatch(start, { patch: { slotTimes: mirrored.slotTimes } });
    expect(viaMirror.slotTimes.lunch).toBe('13:30');
  });
});

describe('saveSettingsPatch', () => {
  const opened: KitchenDb[] = [];
  afterEach(() => { for (const db of opened.splice(0)) db.close(); });

  it('removes keys named in remove and keeps the rest', async () => {
    const db = await openKitchenDb('settingspatch-remove');
    opened.push(db);
    const start = testKitchen();
    start.settings.geminiKey = 'AIza-secret';
    await replaceAll(db, start);

    await saveSettingsPatch(db, { defaultServings: 6 }, ['geminiKey']);

    const saved = await loadKitchen(db);
    expect(saved?.settings.defaultServings).toBe(6);
    expect(saved?.settings).not.toHaveProperty('geminiKey');
  });
});
