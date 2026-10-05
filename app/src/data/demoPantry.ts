// The old v3 app's sample amounts, offered as an optional demo pantry (D-18). Generated:
// edit tools/build_seed.cjs and run `node tools/build_seed.cjs`, never demoPantry.json by hand.
import type { KitchenEvent } from '../domain/types';
import demoJson from './demoPantry.json' with { type: 'json' };

export const demoPantry: KitchenEvent[] = demoJson as KitchenEvent[];
