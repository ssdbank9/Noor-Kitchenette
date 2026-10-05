import { useMemo, useState } from 'react';
import { useKitchenLoad, useSaveState, type KitchenStore } from './storage/useKitchen'; // KR4RJP
import { balances, cookingHistory, makeEvent, monthSummary, reverse } from './domain/ledger';
import { availability, cookableNow, suggestNextMeals } from './domain/suggest';
import type { Ingredient, KitchenEvent, MealSlot, Movement } from './domain/types';
import { fromBase, toBase } from './domain/units';
import { formatHouseholdDay, householdDate, householdTime, instantFromHousehold, nextSlot } from './lib/localDate';
import { BottomNav, type Tab } from './ui/BottomNav';
import { AdjustUsageScreen } from './ui/AdjustUsageScreen';
import { buildUsage } from './domain/usage';
import { CookedScreen, type CookedChoice } from './ui/CookedScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { PantryScreen } from './ui/PantryScreen';
import { RecipesScreen } from './ui/RecipesScreen'; // F33
import { ShopScreen } from './ui/ShopScreen'; // F33
import { addDishShortfall, addLowStock, removeItem, type ShoppingItem, type ShoppingList } from './domain/shopping'; // F33
import { RecipeScreen } from './ui/RecipeScreen';
import { TodayScreen } from './ui/TodayScreen';
import { UpdateBanner } from './ui/UpdateBanner'; // updates

type View =
  | { name: 'tab'; tab: Tab }
  | { name: 'recipe'; recipeId: string; back: Tab | 'recipes' }
  | { name: 'recipes' } // F33
  | { name: 'cooked'; recipeId: string; servings: number; back: Tab | 'recipes' }
  | { name: 'adjust'; recipeId: string; choice: CookedChoice; back: Tab | 'recipes' }; // F61: Nahi path

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', chai: 'Chai', dinner: 'Dinner' };
const YES = 'Haan';
const NO = 'Nahi';

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export function formatAmount(baseAmount: number, ingredient: Ingredient): string {
  const { amount, unit } = fromBase(baseAmount, ingredient);
  return `${amount} ${unit}`;
}

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
  const { ingredients, recipes, settings } = store.data;
  const save = useSaveState(store.queue); // KR4RJP
  const tz = settings.timeZone;
  const [events, setEvents] = useState<KitchenEvent[]>(store.data.events);
  const [view, setView] = useState<View>({ name: 'tab', tab: 'today' });
  const [pick, setPick] = useState(0);
  const [shopList, setShopList] = useState<ShoppingList>(store.shopping); // shoplist
  const [toast, setToast] = useState<{ text: string; undoId?: string } | null>(null);

  const now = new Date();
  const today = householdDate(now, tz);
  const slot = nextSlot(householdTime(now, tz), settings.slotTimes) as MealSlot;
  const servings = settings.defaultServings;

  const byId = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
  const recipesById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const stock = useMemo(() => balances(events), [events]);
  const ranked = useMemo(() => cookableNow(recipes, servings, events, ingredients, toBase), [recipes, servings, events, ingredients]);
  const suggestions = useMemo(
    () => suggestNextMeals(recipes, servings, events, ingredients, toBase, today),
    [recipes, servings, events, ingredients, today],
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
      meal: { recipeId, recipeVersion: recipe.version, slot: choice.slot, servings: choice.servings, rating: choice.rating },
      source: 'recipe',
    }, tz);
    setEvents(prev => [...prev, event]);
    void store.queue.enqueue({ type: 'events', events: [event] }); // KR4RJP
    setView({ name: 'tab', tab: 'today' });
    setToast({
      text: `Saved ${recipe.name}. Pantry updated.`,
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
      setToast({ text: 'Undone. Stock and history are back as they were.' });
    } catch (e) {
      setToast({ text: (e as Error).message });
    }
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
  function boughtItem(item: ShoppingItem, amountBase: number) {
    const event = makeEvent('purchase', [{ ingredientId: item.ingredientId, delta: amountBase, basis: 'measured' }], new Date(), { source: 'typed' }, tz);
    // shoplist: the purchase and the shorter list are ONE queued write (one IndexedDB
    // transaction), so a reload never shows one without the other. If it fails it stays
    // queued as a single op and is retried whole; replay is safe (event put by id, list is
    // a snapshot), so the purchase is never applied twice.
    const next = removeItem(shopList, item.ingredientId);
    setEvents(prev => [...prev, event]);
    setShopList(next);
    void store.queue.enqueue({ type: 'purchase', event, list: next });
    const ing = byId.get(item.ingredientId);
    setToast({ text: `Bought ${ing ? `${formatAmount(amountBase, ing)} ${ing.name}` : 'item'}. Pantry updated.` });
  }

  let screen: React.ReactNode;
  if (view.name === 'recipes') {
    screen = (
      <RecipesScreen
        items={ranked.map(a => ({ recipe: recipesById.get(a.recipeId)!, availability: a }))}
        servings={servings}
        onOpen={id => open(id, 'recipes')}
        onBack={() => setView({ name: 'tab', tab: 'today' })}
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
        initialServings={servings}
        availabilityFor={n => availability(recipe, n, stock, byId, toBase)}
        format={formatAmount}
        timesThisMonth={times}
        onBack={() => setView(view.back === 'recipes' ? { name: 'recipes' } : { name: 'tab', tab: view.back })}
        onCooked={n => setView({ name: 'cooked', recipeId: recipe.id, servings: n, back: view.back })}
      />
    );
  } else if (view.name === 'cooked') {
    const recipe = recipesById.get(view.recipeId)!;
    screen = (
      <CookedScreen
        recipeName={recipe.name}
        today={today}
        slotTimes={settings.slotTimes}
        initialSlot={slot}
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
        onEatOut={() => setToast({ text: 'Eat out arrives in a later build.' })}
        onSnap={() => setToast({ text: 'Photo pantry arrives with Gemini (Phase 2).' })}
      />
    );
  } else if (view.tab === 'history') {
    const month = today.slice(0, 7);
    screen = (
      <HistoryScreen
        monthLabel={new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'))}
        summary={monthSummary(events, month)}
        meals={cookingHistory(events)}
        recipesById={recipesById}
        onUndo={undo}
      />
    );
  } else if (view.tab === 'pantry') {
    // F56 pantry actions: append the event and offer Undo (reuses the toast pattern).
    screen = (
      <PantryScreen
        ingredients={ingredients}
        stock={stock}
        format={formatAmount}
        onAction={(event, text) => { setEvents(prev => [...prev, event]); void store.queue.enqueue({ type: 'events', events: [event] }); setToast({ text, undoId: event.id }); }}
      />
    );
  } else if (view.tab === 'shop') {
    screen = (
      <ShopScreen
        list={shopList}
        ingredients={ingredients}
        recipesById={recipesById}
        format={formatAmount}
        onAddLowStock={() => changeList(addLowStock(shopList, ingredients, stock))} // shoplist
        onBought={boughtItem}
        onToast={text => setToast({ text })}
      />
    );
  } else {
    screen = <div className="placeholder">This part of the app is being built next.</div>;
  }

  return (
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
          {toast.undoId ? (
            <button type="button" onClick={() => { const id = toast.undoId!; setToast(null); undo(id); }}>Undo</button>
          ) : (
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>OK</button>
          )}
        </div>
      )}
      {view.name === 'tab' && <BottomNav current={currentTab} onChange={tab => { setToast(null); setView({ name: 'tab', tab }); }} />}
    </div>
  );
}
