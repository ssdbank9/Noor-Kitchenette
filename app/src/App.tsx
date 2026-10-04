import { useMemo, useState } from 'react';
import { useKitchenLoad, useSaveState, type KitchenStore } from './storage/useKitchen'; // KR4RJP
import { balances, cookingHistory, makeEvent, monthSummary, reverse } from './domain/ledger';
import { availability, cookableNow, suggestNextMeals } from './domain/suggest';
import type { Ingredient, KitchenEvent, MealSlot, Movement } from './domain/types';
import { fromBase, toBase } from './domain/units';
import { formatHouseholdDay, householdDate, householdTime, instantFromHousehold, nextSlot } from './lib/localDate';
import { BottomNav, type Tab } from './ui/BottomNav';
import { CookedScreen, type CookedChoice } from './ui/CookedScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { PantryScreen } from './ui/PantryScreen';
import { RecipeScreen } from './ui/RecipeScreen';
import { TodayScreen } from './ui/TodayScreen';

type View =
  | { name: 'tab'; tab: Tab }
  | { name: 'recipe'; recipeId: string; back: Tab }
  | { name: 'cooked'; recipeId: string; servings: number; back: Tab };

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', chai: 'Chai', dinner: 'Dinner' };
const YES = 'Jee';
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

  const open = (recipeId: string, back: Tab) => setView({ name: 'recipe', recipeId, back });
  const currentTab: Tab = view.name === 'tab' ? view.tab : view.back;

  function saveCooked(recipeId: string, choice: CookedChoice) {
    const recipe = recipesById.get(recipeId)!;
    const a = availability(recipe, choice.servings, balances(events), byId, toBase);
    const movements: Movement[] = choice.usedRecipeAmounts
      ? a.needs.filter(n => n.need !== null && n.need > 0).map(n => ({ ingredientId: n.ingredientId, delta: -n.need!, basis: 'measured' as const }))
      : [];
    const event = makeEvent('cook', movements, instantFromHousehold(choice.localDate, choice.localTime, tz), {
      meal: { recipeId, recipeVersion: recipe.version, slot: choice.slot, servings: choice.servings, rating: choice.rating },
      source: 'recipe',
      note: choice.usedRecipeAmounts ? undefined : 'Amounts not deducted yet: adjust them in Pantry.',
    }, tz);
    setEvents(prev => [...prev, event]);
    void store.queue.enqueue({ type: 'events', events: [event] }); // KR4RJP
    setView({ name: 'tab', tab: 'today' });
    setToast({
      text: choice.usedRecipeAmounts ? `Saved ${recipe.name}. Pantry updated.` : `Saved ${recipe.name}. Adjust amounts in Pantry.`,
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

  let screen: React.ReactNode;
  if (view.name === 'recipe') {
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
        onBack={() => setView({ name: 'tab', tab: view.back })}
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
        onSave={choice => saveCooked(recipe.id, choice)}
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
        onAddToList={() => setToast({ text: 'Shopping list arrives in the next build.' })}
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
    screen = <PantryScreen ingredients={ingredients} stock={stock} format={formatAmount} />;
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
