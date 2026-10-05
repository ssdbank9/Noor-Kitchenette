// How an amount reads on screen. One function for the app and the browser tests, so a wording
// change (household units take a plural: "5 packs", "2 bunches") cannot make them disagree.
import { fromBase } from '../domain/units';
import type { Ingredient } from '../domain/types';

const PLURALS: Record<string, string> = {
  pack: 'packs', packet: 'packets', bunch: 'bunches', cup: 'cups', sprig: 'sprigs',
  clove: 'cloves', dozen: 'dozen', inch: 'inches', pao: 'pao',
};

/** "5 packs", "1 pack", "2 bunches": household units take a plural; metric units do not. */
export function formatAmount(baseAmount: number, ingredient: Ingredient): string {
  const { amount, unit } = fromBase(baseAmount, ingredient);
  const word = amount !== 1 && PLURALS[unit.toLowerCase()] ? PLURALS[unit.toLowerCase()] : unit;
  return `${amount} ${word}`;
}
