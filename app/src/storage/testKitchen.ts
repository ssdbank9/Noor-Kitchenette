// A small but complete kitchen for the storage tests (not used by the app).
// It has every optional field somewhere, a cook event with its meal, and a reversal, so a
// round trip through the database or a backup file exercises the whole data model.

import { SCHEMA_VERSION, type KitchenData } from '../domain/types';

export function testKitchen(): KitchenData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      householdName: "Noor's Kitchen",
      timeZone: 'Asia/Karachi',
      defaultServings: 4,
      slotTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:00', chai: '17:00' },
    },
    ingredients: [
      {
        id: 'Basmati_Rice',
        name: 'Basmati rice',
        aliases: ['chawal'],
        dimension: 'mass',
        displayUnit: 'kg',
        aisle: 'Grains',
        minStock: 1000,
        conversions: { cup: 200 },
      },
      { id: 'Eggs', name: 'Eggs', aliases: ['anday'], dimension: 'count', displayUnit: 'pc', aisle: 'Dairy' },
      { id: 'Masoor_Daal', name: 'Masoor daal', aliases: [], dimension: 'mass', displayUnit: 'g', aisle: 'Pulses' },
    ],
    recipes: [
      {
        id: 'R001',
        name: 'Masoor daal',
        serves: 4,
        time: '40 min',
        notes: '',
        category: 'Daal',
        writtenUrl: 'https://example.com/masoor-daal',
        videoUrl: 'https://www.youtube.com/watch?v=example',
        ingredients: [
          { ingredientId: 'Masoor_Daal', amount: 1, unit: 'cup' },
          { ingredientId: 'Basmati_Rice', amount: 2, unit: 'cup', optional: true },
        ],
        steps: ['Wash the daal.', 'Boil until soft.'],
        version: 2,
      },
      {
        id: 'R002',
        name: 'Anda paratha',
        serves: 2,
        time: '15 min',
        notes: 'Breakfast',
        ingredients: [{ ingredientId: 'Eggs', amount: 2, unit: 'pc' }],
        version: 1,
        personal: true,
      },
    ],
    events: [
      {
        id: 'e1',
        kind: 'purchase',
        at: '2026-09-30T20:30:00.000Z',
        localDate: '2026-10-01',
        localTime: '01:30',
        timeZone: 'Asia/Karachi',
        movements: [
          { ingredientId: 'Masoor_Daal', delta: 1000, basis: 'measured' },
          { ingredientId: 'Eggs', delta: 12, basis: 'measured' },
        ],
        source: 'receipt',
        priceRs: 950,
      },
      {
        id: 'e2',
        kind: 'cook',
        at: '2026-10-01T08:00:00.000Z',
        localDate: '2026-10-01',
        localTime: '13:00',
        timeZone: 'Asia/Karachi',
        movements: [{ ingredientId: 'Masoor_Daal', delta: -200, basis: 'estimate' }],
        meal: { recipeId: 'R001', recipeVersion: 2, slot: 'lunch', servings: 4, rating: 'loved' },
        source: 'recipe',
      },
      {
        id: 'e3',
        kind: 'reversal',
        at: '2026-10-01T08:05:00.000Z',
        localDate: '2026-10-01',
        localTime: '13:05',
        timeZone: 'Asia/Karachi',
        movements: [{ ingredientId: 'Masoor_Daal', delta: 200, basis: 'estimate' }],
        reverses: 'e2',
        note: 'Cooked by mistake',
      },
    ],
  };
}
