// The Plan tab (F54, F60, F71): a week strip, the day's four meal slots, dishes, eating out,
// leftovers, cancelling, and "suggest the rest of my week". Planning never changes stock.
import { useMemo, useState } from 'react';
import { addDays, effectiveIds, type Balance } from '../domain/ledger';
import { applyLeftover } from '../domain/leftovers';
import {
  addDish, addEatOut, addLeftover, applyProposal, cancelMeal, competition, competitionOnDate, isCooked, markLeftoverUsed,
  mealOrNew, mealsFor, removeItem, restoreMeal, setServings, SLOT_NAMES, SLOT_ORDER, suggestWeek, swapDish, weekDates,
  isEatingOut, type Competition, type Proposal,
} from '../domain/plan';
import { toBase } from '../domain/units';
import type { Ingredient, KitchenEvent, Leftover, MealSlot, PlannedMeal, Recipe } from '../domain/types';
import { DishSheet, EatOutSheet, LeftoverSheet, WeekSheet } from './PlanSheets';

export interface PlanScreenProps {
  today: string;
  plan: PlannedMeal[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  events: KitchenEvent[];
  leftovers: Leftover[];
  slotTimes: Record<MealSlot, string>;
  defaultServings: number;
  yesWord: string;
  noWord: string;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onSaveMeal: (meal: PlannedMeal) => void;
  onDeleteMeal: (id: string) => void;
  onSaveLeftover: (leftover: Leftover) => void;
  /** Open the recipe -> I cooked it flow for this planned dish. */
  onCook: (meal: PlannedMeal, itemIndex: number) => void;
  onToast: (text: string) => void;
}

type Sheet =
  | { kind: 'dish'; date: string; slot: MealSlot; swap?: number }
  | { kind: 'eatout'; date: string; slot: MealSlot }
  | { kind: 'leftover'; date: string; slot: MealSlot }
  | { kind: 'week' }
  | null;

const newId = () => globalThis.crypto.randomUUID();

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const utc = (date: string) => new Date(date + 'T00:00:00Z');
const weekday = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(utc(date));
const longDay = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(date));
const shortRange = (a: string, b: string) => {
  const f = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(d));
  return `${f(a)} to ${f(b)}`;
};

export function competitionText(c: Competition, ing: Ingredient | undefined, format: PlanScreenProps['format']): string {
  const name = ing?.name ?? c.ingredientId;
  const fmt = (n: number) => (ing ? format(n, ing) : String(n));
  const have = c.have > 0 ? `you have ${fmt(c.have)}` : 'you have none';
  const names = [...new Set(c.meals.map(m => m.recipeName))];
  return c.meals.length > 1
    ? `${name}: ${c.meals.length} meals need ${fmt(c.need)}, ${have}`
    : `${name}: ${names[0]} needs ${fmt(c.need)}, ${have}`;
}

function Warnings(p: { label: string; items: Competition[]; byId: Map<string, Ingredient>; format: PlanScreenProps['format'] }) {
  if (p.items.length === 0) return null;
  return (
    <section className="plan-warn" aria-label={p.label}>
      <h2 className="plan-warn__title">{p.label}</h2>
      <ul>
        {p.items.map(c => (
          <li key={c.ingredientId}>
            {competitionText(c, p.byId.get(c.ingredientId), p.format)}
            <span className="plan-warn__meals">
              {c.meals.slice(0, 3).map(m => `${weekday(m.localDate)} ${SLOT_NAMES[m.slot]}: ${m.recipeName}`).join(' · ')}{c.meals.length > 3 ? ` · and ${c.meals.length - 3} more` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PlanScreen(p: PlanScreenProps) {
  const [weekStart, setWeekStart] = useState(p.today);
  const [selected, setSelected] = useState(p.today);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const byId = useMemo(() => new Map(p.ingredients.map(i => [i.id, i])), [p.ingredients]);
  const live = useMemo(() => effectiveIds(p.events), [p.events]);
  const days = weekDates(weekStart);
  const warnings = useMemo(
    () => competition(p.plan, p.recipes, p.stock, p.ingredients, toBase, p.today, live),
    [p.plan, p.recipes, p.stock, p.ingredients, p.today, live],
  );
  const weekWarnings = warnings.filter(c => c.meals.some(m => days.includes(m.localDate)));
  const dayWarnings = competitionOnDate(warnings, selected);

  const move = (delta: number) => {
    const next = addDays(weekStart, delta);
    setWeekStart(next);
    setSelected(next);
    setConfirming(null);
  };

  function saveMeal(m: PlannedMeal) {
    if (m.items.length === 0) {
      if (p.plan.some(x => x.id === m.id)) p.onDeleteMeal(m.id);
    } else p.onSaveMeal(m);
  }
  const mealFor = (date: string, slot: MealSlot) => mealOrNew(p.plan, newId(), date, slot, p.defaultServings);

  function pickDish(date: string, slot: MealSlot, swap: number | undefined, recipe: Recipe) {
    const m = mealFor(date, slot);
    const next = swap !== undefined ? swapDish(m, swap, recipe) : addDish(m, recipe);
    setSheet(null);
    if (next === m) { p.onToast(`${recipe.name} is already in this meal.`); return; }
    saveMeal(next);
    p.onToast(swap !== undefined ? `Swapped to ${recipe.name}.` : `Added ${recipe.name}. Your pantry is unchanged.`);
  }

  function ateIt(meal: PlannedMeal, index: number) {
    const item = meal.items[index];
    if (!item || item.kind !== 'leftover') return;
    const l = p.leftovers.find(x => x.id === item.leftoverId);
    if (!l) { p.onToast('That leftover is no longer saved.'); return; }
    const used = applyLeftover(l, { action: 'used', portions: item.portions, at: new Date(), localDate: p.today });
    if (used === l) { p.onToast('No portions of that leftover are left.'); return; }
    p.onSaveLeftover(used);
    p.onSaveMeal(markLeftoverUsed(meal, index, p.today));
    p.onToast(`Enjoy. ${l.portionsLeft - used.portionsLeft} ${l.portionsLeft - used.portionsLeft === 1 ? 'portion' : 'portions'} of ${l.name} used. Your pantry is unchanged.`);
  }

  function proposeWeek(exclude: Map<string, Set<string>>): Proposal[] {
    return suggestWeek({
      plan: p.plan, recipes: p.recipes, events: p.events, ingredients: p.ingredients, toBase,
      today: p.today, servings: p.defaultServings, exclude,
    });
  }
  function useProposals(list: Proposal[]) {
    // Several proposals can land on the same slot only if they were for the same meal, which suggestWeek never does.
    for (const pr of list) p.onSaveMeal(applyProposal(p.plan, pr, newId()));
  }

  const slotSections = SLOT_ORDER.map(slot => {
    const meal = mealsFor(p.plan, selected, slot);
    const name = SLOT_NAMES[slot];
    const cancelled = meal?.status === 'cancelled';
    const out = meal ? isEatingOut(meal) : false;
    return (
      <section key={slot} className={cancelled ? 'plan-slot plan-slot--cancelled' : 'plan-slot'} aria-label={name}>
        <header className="plan-slot__head">
          <div>
            <h3 className="plan-slot__name">{name}</h3>
            <span className="plan-slot__time">{to12h(p.slotTimes[slot])}</span>
          </div>
          {cancelled && <span className="badge badge--need">Cancelled</span>}
          {meal && !cancelled && (
            <div className="stepper" role="group" aria-label={`People for ${name}`}>
              <button type="button" aria-label={`Fewer people for ${name}`} onClick={() => p.onSaveMeal(setServings(meal, meal.servings - 1))}>−</button>
              <output aria-label={`People eating ${name}`}>{meal.servings}</output>
              <button type="button" aria-label={`More people for ${name}`} onClick={() => p.onSaveMeal(setServings(meal, meal.servings + 1))}>+</button>
            </div>
          )}
        </header>

        {meal && meal.items.length > 0 && (
          <ul className="plan-items">
            {meal.items.map((item, index) => {
              if (item.kind === 'dish') {
                const done = isCooked(item, live);
                return (
                  <li key={index} className="plan-item">
                    <span className="plan-item__name">{item.recipeName}</span>
                    {done && <span className="badge badge--ready">Cooked</span>}
                    {!done && out && !cancelled && <span className="badge badge--check">Not cooking</span>}
                    {!cancelled && (
                      <span className="plan-item__actions">
                        {!done && !out && <button type="button" className="button-tint" aria-label={`Cook ${item.recipeName}`} onClick={() => p.onCook(meal, index)}>Cook</button>}
                        {!done && <button type="button" className="button-outline" aria-label={`Swap ${item.recipeName}`} onClick={() => setSheet({ kind: 'dish', date: selected, slot, swap: index })}>Swap</button>}
                        <button type="button" className="button-outline" aria-label={`Remove ${item.recipeName}`} onClick={() => saveMeal(removeItem(meal, index))}>Remove</button>
                      </span>
                    )}
                  </li>
                );
              }
              if (item.kind === 'eatout') {
                return (
                  <li key={index} className="plan-item">
                    <span className="plan-item__name">{item.label ? `Eating out: ${item.label}` : 'Eating out'}</span>
                    {!cancelled && (
                      <span className="plan-item__actions">
                        <button type="button" className="button-outline" aria-label={`Remove eating out from ${name}`} onClick={() => saveMeal(removeItem(meal, index))}>Remove</button>
                      </span>
                    )}
                  </li>
                );
              }
              return (
                <li key={index} className="plan-item">
                  <span className="plan-item__name">Leftovers: {item.label} · {item.portions} {item.portions === 1 ? 'portion' : 'portions'}</span>
                  {item.usedOn && <span className="badge badge--ready">Eaten</span>}
                  {!cancelled && (
                    <span className="plan-item__actions">
                      {!item.usedOn && <button type="button" className="button-tint" aria-label={`Ate ${item.label}`} onClick={() => ateIt(meal, index)}>Ate it</button>}
                      <button type="button" className="button-outline" aria-label={`Remove ${item.label} leftovers`} onClick={() => saveMeal(removeItem(meal, index))}>Remove</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!cancelled && (
          <div className="plan-slot__buttons">
            <button type="button" className="button-tint" aria-label={meal && meal.items.some(i => i.kind === 'dish') ? `Add another dish to ${name}` : `Add a dish to ${name}`}
              onClick={() => setSheet({ kind: 'dish', date: selected, slot })}>
              {meal && meal.items.some(i => i.kind === 'dish') ? '+ Add another dish' : '+ Add a dish'}
            </button>
            <button type="button" className="button-outline" aria-label={`We're eating out for ${name}`} onClick={() => setSheet({ kind: 'eatout', date: selected, slot })}>We're eating out</button>
            <button type="button" className="button-outline" aria-label={`Eat leftovers for ${name}`} onClick={() => setSheet({ kind: 'leftover', date: selected, slot })}>Eat leftovers</button>
          </div>
        )}

        {meal && cancelled && (
          <button type="button" className="button-tint plan-wide" aria-label={`Restore ${name}`} onClick={() => { p.onSaveMeal(restoreMeal(meal)); p.onToast(`${name} is back in the plan.`); }}>Restore this meal</button>
        )}
        {meal && !cancelled && confirming !== meal.id && (
          <button type="button" className="link-button" aria-label={`Cancel ${name}`} onClick={() => setConfirming(meal.id)}>Cancel this meal</button>
        )}
        {meal && !cancelled && confirming === meal.id && (
          <div className="plan-confirm" role="group" aria-label={`Cancel ${name}?`}>
            <p className="plan-confirm__q">Cancel {name}? Nothing is taken from your pantry.</p>
            <div className="choice-grid choice-grid--2">
              <button type="button" className="answer answer--yes" onClick={() => { p.onSaveMeal(cancelMeal(meal)); setConfirming(null); p.onToast(`${name} cancelled.`); }}>{p.yesWord}</button>
              <button type="button" className="answer answer--no" onClick={() => setConfirming(null)}>{p.noWord}</button>
            </div>
          </div>
        )}
      </section>
    );
  });

  const count = (date: string) => mealsFor(p.plan, date).filter(m => m.status === 'planned' && m.items.length > 0).length;
  const dishSheet = sheet?.kind === 'dish' ? sheet : null;
  const dishMeal = dishSheet ? mealsFor(p.plan, dishSheet.date, dishSheet.slot) : undefined;

  return (
    <div className="screen plan">
      <header className="screen__header">
        <h1 className="title">Plan</h1>
        <div className="eyebrow">{shortRange(days[0], days[6])}</div>
      </header>

      <div className="plan-weeknav">
        <button type="button" className="button-outline" aria-label="Previous week" onClick={() => move(-7)}>‹ Previous</button>
        <button type="button" className="button-outline" aria-label="Next week" onClick={() => move(7)}>Next ›</button>
      </div>

      <div className="day-strip plan-days" role="group" aria-label="Day">
        {days.map(d => (
          <button key={d} type="button" className="day" aria-pressed={d === selected} aria-label={`${longDay(d)}${d === p.today ? ', today' : ''}${count(d) ? `, ${count(d)} planned` : ''}`}
            onClick={() => { setSelected(d); setConfirming(null); }}>
            <span className="day__weekday">{d === p.today ? 'Today' : weekday(d)}</span>
            <span className="day__num">{utc(d).getUTCDate()}</span>
            <span className="day__dots" aria-hidden="true">{count(d) > 0 ? '•'.repeat(Math.min(3, count(d))) : ' '}</span>
          </button>
        ))}
      </div>

      <div className="plan-body">
        <Warnings label="Heads up this week" items={weekWarnings} byId={byId} format={p.format} />

        <button type="button" className="button-outline plan-wide" onClick={() => setSheet({ kind: 'week' })}>Suggest the rest of my week</button>

        <h2 className="section__title plan-day-title">{longDay(selected)}</h2>
        <Warnings label="Heads up for this day" items={dayWarnings} byId={byId} format={p.format} />
        {slotSections}
      </div>

      {dishSheet && (
        <DishSheet
          title={dishSheet.swap !== undefined ? 'Swap this dish' : `Add a dish · ${SLOT_NAMES[dishSheet.slot]}`}
          verb={dishSheet.swap !== undefined ? 'Swap to' : 'Add'}
          slot={dishSheet.slot}
          date={dishSheet.date}
          servings={dishMeal?.servings ?? p.defaultServings}
          recipes={p.recipes}
          ingredients={p.ingredients}
          events={p.events}
          onPick={r => pickDish(dishSheet.date, dishSheet.slot, dishSheet.swap, r)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'eatout' && (
        <EatOutSheet
          title={`Eating out · ${SLOT_NAMES[sheet.slot]}`}
          onClose={() => setSheet(null)}
          onSave={label => {
            const { date, slot } = sheet;
            setSheet(null);
            saveMeal(addEatOut({ ...mealFor(date, slot) }, label));
            p.onToast('Eating out planned. Nothing is taken from your pantry.');
          }}
        />
      )}
      {sheet?.kind === 'leftover' && (
        <LeftoverSheet
          title={`Leftovers · ${SLOT_NAMES[sheet.slot]}`}
          leftovers={p.leftovers}
          onClose={() => setSheet(null)}
          onPick={(l, portions) => {
            const { date, slot } = sheet;
            setSheet(null);
            saveMeal(addLeftover(mealFor(date, slot), l, portions));
            p.onToast(`${l.name} planned. Raw ingredients are not used again.`);
          }}
        />
      )}
      {sheet?.kind === 'week' && (
        <WeekSheet
          propose={proposeWeek}
          onClose={() => setSheet(null)}
          onUse={pr => { useProposals([pr]); p.onToast(`Added ${pr.recipeName}.`); }}
          onUseAll={list => { useProposals(list); setSheet(null); p.onToast(`Planned ${list.length} ${list.length === 1 ? 'meal' : 'meals'}. Your pantry is unchanged.`); }}
        />
      )}
    </div>
  );
}

