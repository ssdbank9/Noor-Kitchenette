// The starter collection from the v3 app and the workbooks (F9, F38): 22 recipes,
// 62 ingredients and their starting stock. Generated: edit tools/build_seed.cjs and run
// `node tools/build_seed.cjs`, never seed.json by hand.
import type { KitchenData } from '../domain/types';
import seedJson from './seed.json';

export const seed: KitchenData = seedJson as KitchenData;
