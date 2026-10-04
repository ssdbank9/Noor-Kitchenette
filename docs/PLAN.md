# Noor's Kitchen: build plan

Status: **proposed, 2026-10-04.** Nothing below is agreed until it is recorded in
[`DECISIONS.md`](DECISIONS.md). Aly decides.

Inputs: Codex's coverage review (`Noor_Kitchen_Coverage_Review.html`, `audit/`), the
three source files in `sources/`, and Claude's review in
[`WORKFLOW_REVIEW.md`](WORKFLOW_REVIEW.md). The full list of 77 features is in
[`FEATURES.md`](FEATURES.md); feature IDs (`F43`) and defect IDs (`D3`) below
refer to it and to the defect list in this file.

## 1. What we are building

A phone app for Noor's household kitchen that answers four questions:

1. **What can I cook now?** Recipes ranked against what is actually in the pantry.
2. **What should we cook this week, and what do we need to buy?** A plan by date and
   meal slot, and one shopping basket for the plan.
3. **What is in the kitchen?** Stock that stays correct after shopping, cooking,
   everyday use, waste and corrections, entered by hand or from a photo.
4. **What have we cooked and spent?** History and summaries that can be corrected.

The tone stays personal (F50). The app is built for Noor first.

## 2. The user journey (from Codex's nine steps, re-sequenced)

| Step | What Noor does | Phase |
|---|---|---|
| 1 | Set up: people count, meal slot names, units, storage places | P0/P1 (locations P4) |
| 2 | Bring in the 22 existing recipes; add and edit family recipes | P0 import, P1 editing |
| 3 | Record pantry stock by hand; "not sure" is an allowed amount | P1 (photo P3, expiry P4) |
| 4 | See what is ready now or nearly ready; plan meals by date and slot | P1 suggestions, P2 planner |
| 5 | Build one basket for the plan plus staple top-ups, by aisle | P2 |
| 6 | Record what was actually bought, with optional prices | P2 manual, P3 receipt photo |
| 7 | Cook: scaled recipe, date, slot, servings, confirm what was used | P1 |
| 8 | Everyday use, finished items, then leftovers, freezer, waste | P1 basics, P4 the rest |
| 9 | History, summaries, sharing, backup and restore | P1 basics, P2 sharing, P5 depth |

## 3. Architecture (proposed, see D-01)

- **Installable phone web app (PWA), local-first.** Data lives on the phone in IndexedDB.
  Works offline. Installs to the home screen from an HTTPS address.
- **Every change is an event.** Purchases, cooking, everyday use, waste and corrections
  are stored as events with an ID, a household-local date and the stock movements they
  caused. Pantry balances are calculated from movements. Undo writes a reversing event
  that cancels **all** of the original event's effects, including history and
  statistics. This removes D3 and D4 by design.
- **Quantities carry a unit and a basis.** `{amount, unit, basis: measured | estimate | unknown}`.
  Mass is stored in grams, volume in millilitres, countable items as counts. g/kg and
  ml/L convert automatically; pao, dozen, packets and cups need a per-ingredient or
  per-household rule (F58, F59, F69). Unknown is not zero. Removes D2.
- **Dates are local.** Each event stores the household's local calendar date and time
  zone (Asia/Karachi by default) alongside a UTC timestamp for ordering. Monthly
  grouping uses the local date. Removes D5.
- **Saving can fail visibly.** Writes are confirmed; a failed write shows an error and
  keeps the pending change for retry. Backups carry a schema version and are validated
  before restore, and the current data is kept before replacement (F44, F46, F74). Removes D6.
- **Domain logic is separate from screens.** Units, availability, ranking, the basket and
  the event ledger are plain modules with unit tests, so either agent can change them
  safely.
- **Suggested stack:** TypeScript, Vite, a small UI layer, Vitest for logic,
  Playwright for phone-sized browser tests (390 x 844, Asia/Karachi), as Codex's
  browser checks already used.
- **Photo recognition (P3)** needs a hosted vision model, so it needs a small server
  function that holds the API key. The key never goes into the app (D-03).

## 4. Defects in v3 that the new design must not repeat

| ID | Defect (reproduced by Codex, cause confirmed in source) | v3 source | Fixed by |
|---|---|---|---|
| D1 | Search loses focus after the first letter | lines 213, 239: re-render replaces the input, then `this.focus()` targets the removed node | Do not re-render the input on each key; regression test types a full word (F8) |
| D2 | "500 g" stored as 500 kg; negative read as positive | line 143: `parseFloat` of the number only | Unit-aware parser plus validation and a review screen (F58) |
| D3 | Cooking undo restores stock but keeps the meal in history and stats | snapshot holds pantry only | Event ledger with linked reversal (F43, F77) |
| D4 | Purchase undo leaves "in pantry" ticked at zero stock | marker not in the reversal | Marker derived from the balance, never stored separately (F36) |
| D5 | 1:30 a.m. 1 Oct Karachi meal filed under September | line 209: `toISOString()` (UTC) | Local date stored on the event (F18, F47) |
| D6 | Failed save hidden; edit lost on reload | line 121: `catch(e){}` | Visible save errors and retry (F44) |

## 5. Phases

Each phase ends with something Noor can use. Codex suggested designing the full scope
before choosing phases; this plan does the full design only where it is expensive to
change later (the data model, units, dates, events) and keeps screens incremental.

| Phase | Goal | Feature rows | Done when |
|---|---|---|---|
| **P0 Foundations** | Data model, units, local dates, saving, seed import from the workbooks, test harness | F9, F38, F44, F58, F59, F69, F74 | All 22 recipes, 62 ingredients and 276 recipe-ingredient rows import and reconcile with `audit/reconciliation.json`; unit and ledger tests pass; a failed save is visible |
| **P1 Cook from what we have** | Everything v3 does, without D1 to D6: pantry, recipes, Today suggestions, cooking with confirmation and undo, low stock, monthly stats, backup | 45 rows, see FEATURES.md | Each of the six defects has a regression test that failed on v3 behaviour and passes now; app installs on Noor's phone |
| **Pilot** | One week of real use by Noor | n/a | Noor's feedback recorded in DECISIONS.md before P2 starts |
| **P2 Plan and shop** | Planner by date and slot, one basket for the plan, staples, aisles, actual purchases and prices, single-dish shopping, sharing a list | F33 to F37, F49, F54, F55, F60, F71, F72 | Basket for a 3-meal plan equals hand-calculated need minus stock, counted once |
| **P3 Photo pantry** | Photo to an editable draft, review, then save; receipt photo; one purchase never applied twice | F28 to F30, F52, F57, F73 | Two photos of one purchase change stock once |
| **P4 Kitchen depth** | Fridge/freezer/shelf, batches, expiry and frozen-on dates, leftovers, waste | F65 to F68, F76 | Waste, use and correction are reported separately |
| **P5 Household and insights** | Optional shared access for Noor and Aly, family recipe import from photos, offline sync status | F64, F70, F75 | Depends on D-02 |

The one-week planner idea from the earlier workflow stays a **limited pilot** inside P2,
not the whole product.

## 6. How work is tracked

- Phases and their first tasks are tickets on the Jaira board in `.jaira/`
  (`jaira list`, `jaira next`). Ticket context explains why each exists.
- Product decisions go in `DECISIONS.md`. Agent process lessons go in
  `pending-global-mistakes.md`.
- Rules for Codex and Claude: [`../AGENTS.md`](../AGENTS.md).

## 7. Not verified yet (carried from Codex's review)

Physical phone installation and camera, cloud photo recognition, shared sync, native
Excel recalculation, whether the recipe/video links and Islamabad store suggestions
are still valid, and restore of a malformed backup.
