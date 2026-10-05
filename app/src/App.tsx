import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react'; // F52
import { useKitchenLoad, useSaveState, type KitchenStore } from './storage/useKitchen'; // KR4RJP
import { balances, effectiveIds, makeEvent, monthSummary, reverse } from './domain/ledger'; // F40: cookingHistory moved into HistoryScreen
import { withRecipe, withoutRecipe } from './domain/recipeForm'; // F40
import { RecipeEditor } from './ui/RecipeEditor'; // F40
import { availability, cookableNow, suggestNextMeals, suitsSlot } from './domain/suggest';
import type { Ingredient, KitchenEvent, MealSlot, Movement, Recipe } from './domain/types'; // F40: Recipe
import { toBase } from './domain/units';
import { formatHouseholdDay, householdDate, householdTime, instantFromHousehold, nextSlot } from './lib/localDate';
import { BottomNav, type Tab } from './ui/BottomNav';
import { AdjustUsageScreen } from './ui/AdjustUsageScreen';
import { buildUsage } from './domain/usage';
import { CookedScreen, type CookedChoice } from './ui/CookedScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { PantryScreen } from './ui/PantryScreen';
import { RecipesScreen } from './ui/RecipesScreen'; // F33
import { ShopScreen } from './ui/ShopScreen'; // F33
import { addDishShortfall, type ShoppingItem, type ShoppingList } from './domain/shopping'; // F33
import { RecipeScreen } from './ui/RecipeScreen';
import { TodayScreen } from './ui/TodayScreen';
import { UpdateBanner } from './ui/UpdateBanner'; // updates
import { SettingsScreen } from './ui/SettingsScreen'; // settings
import { GeminiProvider } from './gemini/GeminiContext'; // gemini
import { formatAmount } from './lib/formatAmount';
import { StoreChip } from './ui/StoreChip'; // D22 stores
import { FindOnStore } from './ui/FindOnStore'; // D22 stores
import { StoreActions } from './ui/StoreActions'; // D22 stores
import { copyListText } from './domain/stores'; // D22 stores
import { demoPantry } from './data/demoPantry'; // settings
import { removeSampleEvents, sampleEvents } from './domain/samplePantry'; // settings
import { wordsFor } from './domain/words'; // settings
import { exportBackup, restoreBackup } from './storage/backup'; // settings
import { SnapPantry, type SnapSaveResult } from './ui/SnapPantry'; // F52
import { appendEventOnce } from './domain/photoDraft'; // F52
import { AddDishScreen } from './ui/AddDishScreen'; // F80
import type { Availability } from './domain/suggest'; // F80
import { EatOutScreen } from './ui/EatOutScreen'; // F83
import type { Favourite } from './domain/types'; // F83
import { batchesUseSoon, upsertById } from './domain/batches'; // F65
import { leftoverFromCook, leftoversUseSoon } from './domain/leftoverUse'; // F65
import type { Batch, Leftover, PlannedMeal } from './domain/types'; // F65, F54
import type { PantryView } from './ui/kitchenDepth'; // F65
import { PlanScreen } from './ui/PlanScreen'; // F54
import { basketFromPlan } from './domain/basket'; // F54
import { plannedHero, setCooked, slotStillToday } from './domain/plan'; // F54
import { addManualItem, cartLines, clearDismissals } from './domain/cart'; // D22
import { shopPrefsOf } from './domain/shopPrefs'; // D22
import { finishTrip, takeFromList } from './domain/trip'; // D22
import type { ShopPrefs } from './domain/types'; // D22

type View =
  | { name: 'tab'; tab: Tab }
  | { name: 'recipe'; recipeId: string; back: Tab | 'recipes' }
  | { name: 'settings' } // settings
  | { name: 'snap'; back: Tab } // F52
  | { name: 'recipes' } // F33
  | { name: 'editor'; recipeId: string | null; back: Tab | 'recipes' } // F40
  | { name: 'adddish'; back: Tab | 'recipes' } // F80
  | { name: 'eatout' } // F83
  | { name: 'cooked'; recipeId: string; servings: number; back: Tab | 'recipes' }
  | { name: 'adjust'; recipeId: string; choice: CookedChoice; back: Tab | 'recipes' }; // F61: Nahi path

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', chai: 'Chai', dinner: 'Dinner' };

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};


// --- KR4RJP persistence: load from IndexedDB, then hand the kitchen to the screens ---
export function App() {
  const load = useKitchenLoad();
  if (load.phase === 'ready') return <Kitchen store={load.store} />;
  return (
    <div className="app">
      <main>
        {load.phase === 'loading' ? (
          <div className="placeholder" role="status">Opening the kitchen...</div>
        ) : (
          <div className="placeholder" role="alert">
            Could not open the saved kitchen: {load.error}{' '}
            <button type="button" onClick={load.reload}>Try again</button>
          </div>
        )}
      </main>
    </div>
  );
}
// --- end KR4RJP ---

function Kitchen({ store }: { store: KitchenStore }) {
  const [base, setBase] = useState(store.data); // settings: a restore replaces all of it
  const { ingredients, recipes, settings } = base; // settings
  const save = useSaveState(store.queue); // KR4RJP
  const { yes: YES, no: NO } = wordsFor(settings.words); // settings
  const tz = settings.timeZone;
  const [events, setEvents] = useState<KitchenEvent[]>(store.data.events);
  const [view, setView] = useState<View>({ name: 'tab', tab: 'today' });
  const [pick, setPick] = useState(0);
  const [shopList, setShopList] = useState<ShoppingList>(store.shopping); // shoplist
  const [dishDrafts, setDishDrafts] = useState<Recipe[]>([]); // F80: names of found dishes whose shopping lines are not saved as recipes yet
  const [toast, setToast] = useState<{ text: string; undoId?: string; undoIds?: string[]; undo?: () => void } | null>(null); // settings: undoIds; F65: undo
  // Messages close themselves after 8 seconds; Undo stays available in History.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const snapSaved = useRef(new Set<string>()); // F52
  const tripSaved = useRef(new Set<string>()); // D22: a trip is saved once, however many times Done is tapped
  const [pantryView, setPantryView] = useState<PantryView>('items'); // F65
  const leftovers = base.leftovers ?? []; // F65
  const batches = base.batches ?? []; // F65
  const [planCook, setPlanCook] = useState<{ mealId: string; index: number } | null>(null); // F54: the planned dish being cooked
  useEffect(() => { if (view.name === 'tab') setPlanCook(null); }, [view]); // F54

  const now = new Date();
  const today = householdDate(now, tz);
  // The next meal that has dishes suiting it (no biryani suggested for breakfast).
  const firstSlot = nextSlot(householdTime(now, tz), settings.slotTimes) as MealSlot;
  const slotOrder = (Object.keys(settings.slotTimes) as MealSlot[])
    .sort((a, b) => settings.slotTimes[a].localeCompare(settings.slotTimes[b]));
  const rotated = [...slotOrder.slice(slotOrder.indexOf(firstSlot)), ...slotOrder.slice(0, slotOrder.indexOf(firstSlot))];
  const slot = rotated.find(s => recipes.some(r => suitsSlot(r, s))) ?? firstSlot;
  const servings = settings.defaultServings;

  const byId = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
  const recipesById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const stock = useMemo(() => balances(events), [events]);
  const plan = base.plan ?? []; // F54
  const live = useMemo(() => effectiveIds(events), [events]); // F54
  const plannedNext = slotStillToday(settings.slotTimes[slot], householdTime(now, tz)) ? plannedHero(plan, today, slot, live) : null; // F54
  // F54: the planned dish being cooked, when the open recipe is that dish
  const planLink = (recipeId: string) => {
    const meal = planCook ? plan.find(m => m.id === planCook.mealId) : undefined;
    const item = meal && planCook ? meal.items[planCook.index] : undefined;
    return meal && planCook && item?.kind === 'dish' && item.recipeId === recipeId ? { meal, index: planCook.index } : null;
  };
  const ranked = useMemo(() => cookableNow(recipes, servings, events, ingredients, toBase), [recipes, servings, events, ingredients]);
  const suggestions = useMemo(
    () => suggestNextMeals(recipes, servings, events, ingredients, toBase, today, new Set(), slot),
    [recipes, servings, events, ingredients, today, slot],
  );

  const ready = ranked.filter(a => a.status === 'ready').map(a => ({ recipe: recipesById.get(a.recipeId)!, availability: a }));
  const almost = ranked
    .filter(a => a.status === 'missing' && a.missing.length <= 2)
    .slice(0, 3)
    .map(a => ({
      recipe: recipesById.get(a.recipeId)!,
      availability: a,
      missingNames: a.missing.map(m => byId.get(m.ingredientId)?.name.toLowerCase() ?? m.ingredientId),
    }));

  const open = (recipeId: string, back: Tab | 'recipes') => setView({ name: 'recipe', recipeId, back });
  const currentTab: Tab = view.name === 'tab' ? view.tab : 'today';

  function saveCooked(recipeId: string, choice: CookedChoice, adjusted?: Movement[]) {
    const recipe = recipesById.get(recipeId)!;
    const a = availability(recipe, choice.servings, balances(events), byId, toBase);
    const movements: Movement[] = adjusted ?? (choice.usedRecipeAmounts
      ? a.needs.filter(n => n.need !== null && n.need > 0).map(n => ({ ingredientId: n.ingredientId, delta: -n.need!, basis: 'measured' as const }))
      : []);
    const event = makeEvent('cook', movements, instantFromHousehold(choice.localDate, choice.localTime, tz), {
      recordedAt: new Date().toISOString(), // stock follows when it was recorded, not the meal time
      meal: { recipeId, recipeName: recipe.name, recipeVersion: recipe.version, slot: choice.slot, servings: choice.servings, rating: choice.rating },
      source: 'recipe',
    }, tz);
    setEvents(prev => [...prev, event]);
    void store.queue.enqueue({ type: 'events', events: [event] }); // KR4RJP
    const made = choice.leftover ? leftoverFromCook(event, recipe, choice.leftover.portions, choice.leftover.location) : null; // F65: same render, id derived from the cook event
    if (made) { setBase(b => ({ ...b, leftovers: upsertById(b.leftovers ?? [], made) })); void store.queue.enqueue({ type: 'leftover', item: made }); } // F65
    const pl = planLink(recipeId); // F54
    if (pl) savePlanMeal(setCooked(pl.meal, pl.index, event.id)); // F54
    setView({ name: 'tab', tab: 'today' });
    setToast({
      text: `Saved ${recipe.name}. Pantry updated.${made ? ' Leftovers kept.' : ''}`,
      undoId: event.id,
    });
  }

  function undo(eventId: string) {
    const target = events.find(e => e.id === eventId);
    if (!target) return;
    try {
      const r = reverse(target, events, new Date());
      setEvents(prev => [...prev, r]);
      void store.queue.enqueue({ type: 'events', events: [r] }); // KR4RJP
      for (const l of leftovers.filter(x => x.fromEventId === eventId)) deleteLeftover(l.id); // F65: what this entry made goes with it
      for (const b of batches.filter(x => x.fromEventId === eventId)) removeBatch(b.id); // F65
      setToast({ text: 'Undone. Stock and history are back as they were.' });
    } catch (e) {
      setToast({ text: (e as Error).message });
    }
  }

  // F65 to F68: leftovers and batches. Each change is queued for the database AND applied to the screen's copy.
  function putLeftover(item: Leftover) {
    setBase(b => ({ ...b, leftovers: upsertById(b.leftovers ?? [], item) }));
    void store.queue.enqueue({ type: 'leftover', item });
  }
  function deleteLeftover(id: string) {
    setBase(b => ({ ...b, leftovers: (b.leftovers ?? []).filter(l => l.id !== id) }));
    void store.queue.enqueue({ type: 'deleteLeftover', id });
  }
  function changeLeftover(next: Leftover, previous: Leftover | null, text: string) {
    putLeftover(next);
    setToast({ text, undo: () => { if (previous) putLeftover(previous); else deleteLeftover(next.id); setToast({ text: 'Undone.' }); } });
  }
  function putBatch(item: Batch) {
    setBase(b => ({ ...b, batches: upsertById(b.batches ?? [], item) }));
    void store.queue.enqueue({ type: 'batch', item });
  }
  function removeBatch(id: string) {
    setBase(b => ({ ...b, batches: (b.batches ?? []).filter(x => x.id !== id) }));
    void store.queue.enqueue({ type: 'deleteBatch', id });
  }
  const useSoonNames = useMemo(() => [
    ...leftoversUseSoon(leftovers, today).map(x => x.leftover.name),
    ...batchesUseSoon(batches, stock, today).filter(x => x.status.state !== 'may-be-used-up').map(x => byId.get(x.status.batch.ingredientId)?.name ?? ''),
  ].filter(Boolean), [leftovers, batches, stock, today, byId]); // F67

  // F52: Snap pantry. One event per confirmed draft; the same event id is never saved twice.
  function saveSnap(r: SnapSaveResult) {
    if (snapSaved.current.has(r.event.id)) return;
    snapSaved.current.add(r.event.id);
    const fresh = r.newIngredients.filter(i => !base.ingredients.some(x => x.id === i.id));
    if (fresh.length) {
      setBase(b => ({ ...b, ingredients: [...b.ingredients, ...fresh.filter(i => !b.ingredients.some(x => x.id === i.id))] }));
      for (const ingredient of fresh) void store.queue.enqueue({ type: 'ingredient', ingredient });
    }
    setEvents(prev => appendEventOnce(prev, r.event));
    void store.queue.enqueue({ type: 'events', events: [r.event] });
    setToast({ text: r.toast, undoId: r.event.id });
  }

  // settings: saved settings, sample pantry, backup and restore
  function changeSettings(patch: Partial<typeof settings>) {
    const next = Object.fromEntries(Object.entries({ ...settings, ...patch }).filter(([, v]) => v !== undefined)) as typeof settings;
    setBase(b => ({ ...b, settings: next }));
    void store.queue.enqueue({ type: 'settings', settings: next });
  }
  const sampleLoaded = useMemo(() => removeSampleEvents(events, new Date()).length > 0, [events]);
  function loadSample() {
    const added = sampleEvents(demoPantry, new Date(), tz);
    setEvents(prev => [...prev, ...added]);
    void store.queue.enqueue({ type: 'events', events: added });
    setToast({ text: 'Sample pantry added.', undoIds: added.map(e => e.id) });
  }
  function removeSample(only?: Set<string>) {
    const reversals = removeSampleEvents(events, new Date(), only);
    if (reversals.length === 0) return;
    setEvents(prev => [...prev, ...reversals]);
    void store.queue.enqueue({ type: 'events', events: reversals });
    setToast({ text: 'Sample pantry removed.' });
  }
  async function restore(text: string) {
    if (store.queue.getState().pending > 0) return { ok: false as const, errors: ['Some changes are still being saved. Try again in a moment.'] };
    try {
      const r = await restoreBackup(store.db, text);
      if (!r.ok) return r;
      setBase(r.data);
      setEvents(r.data.events);
      setShopList([]);
      setPick(0);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, errors: [`The backup could not be saved: ${(e as Error).message}`] };
    }
  }

  // F40: own recipes. Each change is queued for the database AND applied to the screen's copy.
  function saveOwnRecipe(recipe: Recipe, newIngredients: Ingredient[], back: Tab | 'recipes') {
    for (const ingredient of newIngredients) void store.queue.enqueue({ type: 'ingredient', ingredient });
    void store.queue.enqueue({ type: 'recipe', recipe });
    setBase(b => withRecipe(b, recipe, newIngredients));
    setToast({ text: `Saved ${recipe.name}.` });
    setView({ name: 'recipe', recipeId: recipe.id, back });
  }
  function deleteOwnRecipe(recipeId: string) {
    const name = recipesById.get(recipeId)?.name ?? 'The recipe';
    void store.queue.enqueue({ type: 'deleteRecipe', recipeId });
    setBase(b => withoutRecipe(b, recipeId));
    setToast({ text: `Deleted ${name}. Cooking history keeps its name.` });
    setView({ name: 'recipes' });
  }

  // F33: recipes and shopping list
  function addToList(recipeId: string) {
    const recipe = recipesById.get(recipeId)!;
    changeList(addDishShortfall(shopList, availability(recipe, servings, stock, byId, toBase))); // shoplist
    setToast({ text: 'Added to Shop' });
  }
  // shoplist: every list change is saved as a whole-list snapshot through the save queue.
  function changeList(next: ShoppingList) {
    setShopList(next);
    void store.queue.enqueue({ type: 'shopping', list: next });
  }
  // F54: plan changes. Every change is queued for the database AND applied to the screen's copy.
  function savePlanMeal(meal: PlannedMeal) {
    void store.queue.enqueue({ type: 'plan', meal });
    setBase(b => {
      const list = b.plan ?? [];
      return { ...b, plan: list.some(m => m.id === meal.id) ? list.map(m => (m.id === meal.id ? meal : m)) : [...list, meal] };
    });
  }
  function deletePlanMeal(id: string) {
    void store.queue.enqueue({ type: 'deletePlan', id });
    setBase(b => ({ ...b, plan: (b.plan ?? []).filter(m => m.id !== id) }));
  }
  function saveLeftoverItem(item: Leftover) {
    void store.queue.enqueue({ type: 'leftover', item });
    setBase(b => {
      const list = b.leftovers ?? [];
      return { ...b, leftovers: list.some(l => l.id === item.id) ? list.map(l => (l.id === item.id ? item : l)) : [...list, item] };
    });
  }
  function cookFromPlan(meal: PlannedMeal, index: number) {
    const item = meal.items[index];
    if (!item || item.kind !== 'dish' || !recipesById.has(item.recipeId)) { setToast({ text: 'That dish is no longer in your recipes.' }); return; }
    setPlanCook({ mealId: meal.id, index });
    open(item.recipeId, 'plan');
  }
  const basketFor = (topUps: boolean) => basketFromPlan(plan, recipes, stock, ingredients, toBase, today, live, { topUps });

  function boughtItem(item: ShoppingItem, amountBase: number, fromBasket = false) { // F54: fromBasket keeps the manual list as it is
    const event = makeEvent('purchase', [{ ingredientId: item.ingredientId, delta: amountBase, basis: 'measured' }], new Date(), { source: 'typed' }, tz);
    // shoplist: the purchase and the shorter list are ONE queued write (one IndexedDB
    // transaction), so a reload never shows one without the other. If it fails it stays
    // queued as a single op and is retried whole; replay is safe (event put by id, list is
    // a snapshot), so the purchase is never applied twice.
    const next = fromBasket ? shopList : takeFromList(shopList, { [item.ingredientId]: amountBase }); // F54, D22: a part-bought manual line keeps the rest
    setEvents(prev => [...prev, event]);
    setShopList(next);
    void store.queue.enqueue({ type: 'purchase', event, list: next });
    const cleared = clearDismissals(prefs, [item.ingredientId]); // D22: bought, so an old "not this week" / "remove" no longer applies
    if (cleared !== prefs) savePrefs(cleared); // D22
    const ing = byId.get(item.ingredientId);
    setToast({ text: `Bought ${ing ? `${formatAmount(amountBase, ing)} ${ing.name}` : 'item'}. Pantry updated.` });
  }

  // D22: the To-buy cart. Shop preferences (snoozes, removals, the trip) live in base.shopPrefs;
  // every change is queued for the database AND applied to the screen's copy.
  const prefs = shopPrefsOf(base.shopPrefs);
  function savePrefs(next: ShopPrefs) {
    setBase(b => ({ ...b, shopPrefs: next }));
    void store.queue.enqueue({ type: 'shopPrefs', prefs: next });
  }
  function saveIngredient(ingredient: Ingredient) {
    setBase(b => ({ ...b, ingredients: b.ingredients.some(i => i.id === ingredient.id) ? b.ingredients.map(i => (i.id === ingredient.id ? ingredient : i)) : [...b.ingredients, ingredient] }));
    void store.queue.enqueue({ type: 'ingredient', ingredient });
  }
  function addCartItem(ingredient: Ingredient, isNew: boolean, amountBase: number) {
    if (isNew) saveIngredient(ingredient);
    changeList(addManualItem(shopList, ingredient.id, amountBase));
    setToast({ text: `Added ${formatAmount(amountBase, ingredient)} ${ingredient.name} to the list.` });
  }
  function doneShopping(priceRs?: number) {
    const trip = prefs.trip;
    if (!trip || tripSaved.current.has(trip.id)) return; // a double tap saves once
    const r = finishTrip(prefs, shopList, new Date(), tz, priceRs);
    if (!r.ok) { setToast({ text: r.message }); return; }
    tripSaved.current.add(trip.id);
    setEvents(prev => appendEventOnce(prev, r.event));
    setBase(b => ({ ...b, shopPrefs: r.prefs }));
    setShopList(r.list);
    // One purchase with a stable id (trip-<id>), the cleared trip and the shorter manual list, in the same tick.
    void store.queue.enqueue({ type: 'tripDone', event: r.event, prefs: r.prefs });
    void store.queue.enqueue({ type: 'shopping', list: r.list });
    // Undo reverses the purchase (the usual undo). The trip is NOT restored: it is finished. Start a new one to shop again.
    setToast({ text: 'Saved your shopping. Pantry updated.', undoId: r.event.id });
  }
  // F80: add a new dish by name. Saved only when Noor taps Save; always a NEW personal recipe.
  function keepIngredients(list: Ingredient[]) {
    const fresh = list.filter(i => !byId.has(i.id));
    if (fresh.length === 0) return;
    setBase(b => ({ ...b, ingredients: [...b.ingredients, ...fresh.filter(i => !b.ingredients.some(x => x.id === i.id))] }));
    for (const ingredient of fresh) void store.queue.enqueue({ type: 'ingredient', ingredient });
  }
  function saveDish(recipe: Recipe, newIngredients: Ingredient[]) {
    keepIngredients(newIngredients);
    setBase(b => ({ ...b, recipes: [...b.recipes, recipe] }));
    void store.queue.enqueue({ type: 'recipe', recipe });
    setDishDrafts(prev => prev.filter(r => r.id !== recipe.id));
    setToast({ text: `Saved ${recipe.name} to your recipes.` });
    open(recipe.id, 'recipes');
  }
  function addDishToList(a: Availability, newIngredients: Ingredient[], dishName: string) {
    keepIngredients(newIngredients);
    const next = addDishShortfall(shopList, a);
    if (next === shopList) { setToast({ text: `Nothing new to add for ${dishName}.` }); return; }
    setDishDrafts(prev => [...prev.filter(r => r.id !== a.recipeId), { id: a.recipeId, name: dishName, serves: a.servings, time: '', notes: '', ingredients: [], version: 1 }]);
    changeList(next);
    setToast({ text: 'Added to Shop' });
  }
  const shopRecipes = useMemo(() => new Map([...dishDrafts.map(r => [r.id, r] as const), ...recipesById]), [dishDrafts, recipesById]); // F80

  const cart = cartLines({ manual: shopList, basket: basketFor(false), ingredients, stock, today, prefs }); // D22
  let screen: React.ReactNode;
  if (view.name === 'settings') { // settings
    screen = (
      <SettingsScreen
        settings={settings}
        sampleLoaded={sampleLoaded}
        onChange={changeSettings}
        onLoadSample={loadSample}
        onRemoveSample={() => removeSample()}
        onExport={() => exportBackup({ ...base, events })}
        onRestore={restore}
        onBack={() => setView({ name: 'tab', tab: 'today' })}
        shopPrefs={shopPrefsOf(base.shopPrefs)} // D22 stores
        onShopPrefs={savePrefs} // D22 stores
      />
    );
  } else if (view.name === 'snap') { // F52
    const backTab = view.back;
    screen = (
      <SnapPantry
        ingredients={ingredients}
        stock={stock}
        format={formatAmount}
        yesWord={YES}
        noWord={NO}
        today={today}
        timeZone={tz}
        onSave={saveSnap}
        onSettings={() => { setToast(null); setView({ name: 'settings' }); }}
        onClose={() => setView({ name: 'tab', tab: backTab })}
      />
    );
  } else if (view.name === 'eatout') { // F83
    screen = (
      <EatOutScreen
        favourites={base.favourites ?? []}
        today={today}
        timeZone={tz}
        yesWord={YES}
        noWord={NO}
        homeArea={settings.homeArea} // D22 geo
        onOpenSettings={() => setView({ name: 'settings' })} // D22 geo
        onSave={(item: Favourite) => {
          setBase(b => ({ ...b, favourites: [...(b.favourites ?? []).filter(f => f.id !== item.id), item] }));
          void store.queue.enqueue({ type: 'favourite', item });
        }}
        onDelete={id => {
          setBase(b => ({ ...b, favourites: (b.favourites ?? []).filter(f => f.id !== id) }));
          void store.queue.enqueue({ type: 'deleteFavourite', id });
        }}
        onToast={text => setToast({ text })}
        onBack={() => setView({ name: 'tab', tab: 'today' })}
      />
    );
  } else if (view.name === 'adddish') { // F80
    const backTo = view.back;
    screen = (
      <AddDishScreen
        recipes={recipes}
        ingredients={ingredients}
        stock={stock}
        today={today}
        defaultServings={servings}
        yesWord={YES}
        noWord={NO}
        format={formatAmount}
        onBack={() => setView(backTo === 'recipes' ? { name: 'recipes' } : { name: 'tab', tab: backTo })}
        onOpenRecipe={id => open(id, backTo)}
        onOpenSettings={() => { setToast(null); setView({ name: 'settings' }); }}
        onAddMissing={addDishToList}
        onSave={saveDish}
      />
    );
  } else if (view.name === 'recipes') {
    screen = (
      <RecipesScreen
        items={ranked.map(a => ({ recipe: recipesById.get(a.recipeId)!, availability: a }))}
        servings={servings}
        onOpen={id => open(id, 'recipes')}
        onAddDish={() => setView({ name: 'adddish', back: 'recipes' })} // F80
        onBack={() => setView({ name: 'tab', tab: 'today' })}
        onAdd={() => setView({ name: 'editor', recipeId: null, back: 'recipes' })} // F40
      />
    );
  } else if (view.name === 'editor') { // F40
    const editing = view.recipeId ? recipesById.get(view.recipeId) : undefined;
    const goBack = () => (editing ? open(editing.id, view.back) : setView(view.back === 'recipes' ? { name: 'recipes' } : { name: 'tab', tab: view.back }));
    screen = (
      <RecipeEditor
        key={editing?.id ?? 'new'}
        recipe={editing}
        ingredients={ingredients}
        categories={[...new Set(recipes.map(r => r.category).filter((c): c is string => Boolean(c)))]}
        defaultServings={servings}
        yesWord={YES}
        noWord={NO}
        onSave={(recipe, fresh) => saveOwnRecipe(recipe, fresh, view.back)}
        onDelete={editing?.personal ? deleteOwnRecipe : undefined}
        onBack={goBack}
      />
    );
  } else if (view.name === 'recipe') {
    const recipe = recipesById.get(view.recipeId)!;
    const month = today.slice(0, 7);
    const times = monthSummary(events, month).byRecipe.find(r => r.recipeId === recipe.id)?.count ?? 0;
    screen = (
      <RecipeScreen
        key={recipe.id}
        recipe={recipe}
        ingredientsById={byId}
        initialServings={planLink(recipe.id)?.meal.servings ?? servings} // F54
        availabilityFor={n => availability(recipe, n, stock, byId, toBase)}
        format={formatAmount}
        timesThisMonth={times}
        onBack={() => setView(view.back === 'recipes' ? { name: 'recipes' } : { name: 'tab', tab: view.back })}
        onCooked={n => setView({ name: 'cooked', recipeId: recipe.id, servings: n, back: view.back })}
        onEdit={() => setView({ name: 'editor', recipeId: recipe.id, back: view.back })} // F40
      />
    );
  } else if (view.name === 'cooked') {
    const recipe = recipesById.get(view.recipeId)!;
    screen = (
      <CookedScreen
        recipeName={recipe.name}
        today={today}
        slotTimes={settings.slotTimes}
        initialSlot={planLink(recipe.id)?.meal.slot ?? slot} // F54
        initialDate={planLink(recipe.id)?.meal.localDate} // F54
        initialServings={view.servings}
        yesWord={YES}
        noWord={NO}
        onBack={() => open(recipe.id, view.back)}
        onSave={choice => (choice.usedRecipeAmounts ? saveCooked(recipe.id, choice) : setView({ name: 'adjust', recipeId: recipe.id, choice, back: view.back }))}
      />
    );
  } else if (view.name === 'adjust') { // F61: adjust usage
    const recipe = recipesById.get(view.recipeId)!;
    const choice = view.choice;
    screen = (
      <AdjustUsageScreen
        key={recipe.id}
        recipeName={recipe.name}
        lines={buildUsage(availability(recipe, choice.servings, stock, byId, toBase), recipe, byId)}
        ingredientsById={byId}
        onBack={() => setView({ name: 'cooked', recipeId: recipe.id, servings: choice.servings, back: view.back })}
        onSave={movements => saveCooked(recipe.id, choice, movements)}
      />
    );
  } else if (view.tab === 'today') {
    const s = suggestions.length ? suggestions[pick % suggestions.length] : null;
    screen = (
      <TodayScreen
        dateLabel={formatHouseholdDay(now, tz)}
        slotLabel={`${SLOT_LABEL[slot]}, ${to12h(settings.slotTimes[slot])}`}
        servings={servings}
        suggestion={s}
        ready={ready}
        almost={almost}
        yesWord={YES}
        onCook={id => open(id, 'today')}
        onAnother={() => setPick(i => i + 1)}
        onOpenRecipe={id => open(id, 'today')}
        onAddToList={addToList}
        onSeeAll={() => setView({ name: 'recipes' })}
        onEatOut={() => { setToast(null); setView({ name: 'eatout' }); }} // F83
        onAddDish={() => setView({ name: 'adddish', back: 'today' })} // F80
        toBuy={cart.length} // D22
        onOpenShop={() => setView({ name: 'tab', tab: 'shop' })} // D22
        useSoon={useSoonNames} // F67
        onUseSoon={() => { setPantryView('soon'); setView({ name: 'tab', tab: 'pantry' }); }} // F67
        onSnap={() => { setToast(null); setView({ name: 'snap', back: 'today' }); }} // F52
        pantryEmpty={stock.size === 0} // settings
        onSettings={() => { setToast(null); setView({ name: 'settings' }); }} // settings
        onOpenPantry={() => setView({ name: 'tab', tab: 'pantry' })} // settings
        onLoadSample={loadSample} // settings
        planned={plannedNext} // F54
        onCookPlanned={(mealId, index) => { const m = plan.find(x => x.id === mealId); if (m) cookFromPlan(m, index); }} // F54
      />
    );
  } else if (view.tab === 'plan') { // F54
    screen = (
      <PlanScreen
        today={today}
        plan={plan}
        recipes={recipes}
        ingredients={ingredients}
        stock={stock}
        events={events}
        leftovers={base.leftovers ?? []}
        slotTimes={settings.slotTimes}
        defaultServings={servings}
        yesWord={YES}
        noWord={NO}
        format={formatAmount}
        onSaveMeal={savePlanMeal}
        onDeleteMeal={deletePlanMeal}
        onSaveLeftover={saveLeftoverItem}
        onCook={cookFromPlan}
        onToast={text => setToast({ text })}
      />
    );
  } else if (view.tab === 'history') {
    screen = (
      <HistoryScreen
        events={events} // F40: the screen works out the range, names and "not cooked in a while"
        today={today}
        recipesById={recipesById}
        onUndo={undo}
        onOpenRecipe={id => open(id, 'history')}
      />
    );
  } else if (view.tab === 'pantry') {
    // F56 pantry actions: append the event and offer Undo (reuses the toast pattern).
    screen = (
      <PantryScreen
        ingredients={ingredients}
        stock={stock}
        format={formatAmount}
        onSnap={() => { setToast(null); setView({ name: 'snap', back: 'pantry' }); }} // F52
        onAction={(event, text, batch) => { setEvents(prev => [...prev, event]); void store.queue.enqueue({ type: 'events', events: [event] }); if (batch) putBatch(batch); /* F66 */ setToast({ text, undoId: event.id }); }}
        depth={{ // F65 to F68
          view: pantryView, onView: setPantryView, today, yesWord: YES, noWord: NO, leftovers, batches, events,
          onChangeLeftover: changeLeftover,
          onSaveBatch: (batch, text) => { putBatch(batch); setToast({ text }); },
          onDeleteBatch: batch => { removeBatch(batch.id); setToast({ text: 'Batch deleted.', undo: () => { putBatch(batch); setToast({ text: 'Batch put back.' }); } }); },
          onUndoEvent: undo,
        }}
      />
    );
  } else if (view.tab === 'shop') {
    screen = (
      <ShopScreen
        list={shopList}
        lines={cart} // D22
        ingredients={ingredients}
        recipesById={shopRecipes} // F80
        format={formatAmount}
        onBought={boughtItem}
        onToast={(text, undo) => setToast({ text, undo })} // D22
        prefs={prefs} // D22
        stock={stock} // D22
        today={today} // D22
        yesWord={YES} // D22
        noWord={NO} // D22
        onPrefs={savePrefs} // D22
        onChangeList={changeList} // D22
        onSaveIngredient={saveIngredient} // D22
        onAddItem={addCartItem} // D22
        onTripDone={doneShopping} // D22
        extras={line => { // D22 stores: per-line store choice and where-to-buy links
          const ing = ingredients.find(i => i.id === line.ingredientId);
          return ing ? (
            <div className="line-stores">
              <StoreChip ingredientId={ing.id} ingredientName={ing.name} prefs={prefs} onChange={savePrefs} />
              <FindOnStore
                itemName={ing.name}
                prefs={prefs}
                copyTextFor={id => { const st = prefs.stores.find(x => x.id === id); return st ? copyListText(cart, ingredients, st, prefs) : ing.name; }}
              />
            </div>
          ) : null;
        }}
        listExtras={<StoreActions lines={cart} ingredients={ingredients} prefs={prefs} />} // D22 stores
      />
    );
  } else {
    screen = <div className="placeholder">This part of the app is being built next.</div>;
  }

  return (
    <GeminiProvider apiKey={settings.geminiKey}> {/* gemini */}
    <div className="app">
      {save.status === 'error' && ( // KR4RJP
        <div className="save-banner" role="alert">
          <span>Not saved yet</span>
          <button type="button" onClick={() => void store.queue.retry()}>Retry</button>
        </div>
      )}
      <UpdateBanner queue={store.queue} /> {/* updates */}
      <main>{screen}</main>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo ? ( // F65
            <button type="button" onClick={() => { const f = toast.undo!; setToast(null); f(); }}>Undo</button>
          ) : toast.undoIds ? ( // settings
            <button type="button" onClick={() => { const ids = new Set(toast.undoIds); removeSample(ids); }}>Undo</button>
          ) : toast.undoId ? (
            <button type="button" onClick={() => { const id = toast.undoId!; setToast(null); undo(id); }}>Undo</button>
          ) : (
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>OK</button>
          )}
        </div>
      )}
      {view.name === 'tab' && <BottomNav current={currentTab} onChange={tab => { setToast(null); setView({ name: 'tab', tab }); }} />}
    </div>
    </GeminiProvider>
  );
}
