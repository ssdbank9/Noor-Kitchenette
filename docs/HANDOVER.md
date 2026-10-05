# Handover for review: Noor's Kitchen

Written 2026-10-06 by Claude (orchestrating Sonnet builders) for Codex to review.
Owner and sole decision maker: Aly Jafferani. Main user: Noor. Read `AGENTS.md` first (shared rules).

## 1. What this is
A button-first phone app (PWA) for Noor's household kitchen in I-8, Islamabad (time zone
Asia/Karachi). React 19 + TypeScript 7, Vite 8, vite-plugin-pwa, IndexedDB via `idb`, Vitest,
Playwright. No server and no accounts: all data is on the phone. Hosted as static files on Netlify
(`https://nooris-kitchenette.netlify.app`, from `main`, `netlify.toml`). Repo (public, D-05):
`ssdbank9/Noor-Kitchenette`. App code is in `app/`; seed generation in `tools/`.

## 2. State
- `main` = everything below, last commit `510f703` (before this handover commit). All work is merged.
- Verified 2026-10-06 on `main`: `npm run typecheck` clean; `npm test` 697/697; `npm run test:e2e`
  97/97 (Chrome, 390x844, Asia/Karachi). One clipboard test in `eatout.spec.ts` is occasionally flaky
  under parallel load and passes on its automatic retry (`retries: 1`).
- Nothing has been run on a real phone. Gemini has only been exercised against mocked responses.

## 3. Features (tabs: Today, Plan, Pantry, Snacks, Shop, History; Settings and Eat out are screens)
- **Cook from stock:** recipes ranked by what is in stock; "Cooked it" with Haan/Nahi buttons;
  using less or more than the recipe is recorded; undo. Own recipes (add/edit/delete with steps).
- **Pantry:** per-item actions, units, "unknown is never zero", leftovers, storage places, expiry
  dates, Use soon, Waste report. Optional sample pantry (Settings, remove before handing to Noor).
- **Plan tab and weekly basket:** derived from plan and stock; planning never changes stock.
- **Gemini (key entered in Settings, kept on the phone only, D-08/D-20):** Snap pantry (groceries,
  receipt, pantry photos become a reviewed draft) and Add a new dish by name (search, choose, review).
  Gemini only returns drafts; the user confirms every line.
- **Shop (D-22):** self-filling To-buy cart (low stock, plan, dishes, manual), snooze/remove/always-keep,
  trip mode (one purchase per trip, id `trip-<tripId>`), stores (Al-Fatah, pandamart, Carrefour, I-8
  shops) with search links, copy-list handoff and Maps directions. No prices or stock anywhere.
- **Snacks tab (D-23):** Snacks & noodles aisle, search-and-add, "+ List", starter snacks incl. Buldak.
- **Eat out:** moods and favourites, foodpanda handoff, nearest-first from the home area, and
  **Orders Aly paid for (D-23):** log cost, Pay back all or half, Paid, log kept.
- **Backup/restore** (hand-validated, no schema library), safe update banner (`registerType: 'prompt'`).

## 4. Where to look (and what to challenge)
| Area | Files | Review focus |
|---|---|---|
| Stock ledger | `app/src/domain/ledger.ts`, `usage.ts` | Stock derives from events in recorded order (`recordedAt ?? at`); reversals; `set-stock` anchors; "unknown" is not zero. Look for order dependence and double counting. |
| Cart and trips | `domain/cart.ts`, `trip.ts`, `shopPrefs.ts` | Merge rule (larger need, never sum); dismissals hide only the automatic low reason; low = recorded stock or always-keep staples only (otherwise ~60 starter items flood the cart); a trip finishes as exactly one idempotent purchase. |
| Storage | `storage/db.ts`, `useKitchen.ts`, `saveQueue.ts`, `backup.ts` | Layout version 3; pending-write replay for every write type; `replaceAll` clears every collection; every new field needs a backup reader (a `buyAmount` reader was once missing). Order costs live in meta key `orderCosts` (whole list, last write wins). |
| Gemini | `app/src/gemini/*` | Output is untrusted (`sanitize.ts`); key in header only; request cap, 12 req/min, 45 s timeout; found recipes are always NEW personal recipes. |
| Eat-out list | `tools/eatout/*`, `domain/geo.ts`, `eatout.ts` | Public list keeps restaurant lat/lng (4 dp), strips distance, delivery time, link queries and refuses to write if the home coordinates appear. |
| Order costs | `domain/orderCosts.ts`, `ui/OrderCostsPanel.tsx` | Half rounds up; unchosen orders are not in the due total; Paid cannot be changed after it is set (use Not paid yet). |
| UI | `ui/*`, `styles.css` | Phone-size layout, 6-tab bar (grid has 6 columns), Netlify badge lift (`body:has(#nl-badge-frame)`), toast above the nav. |

Known weak spots to test hard: pending-write replay after a closed tab; units for count vs mass
ingredients (`units.ts`, `lib/formatAmount.ts`); date handling across midnight in Asia/Karachi;
duplicate ingredient ids when creating new items; backup round-trip of every new field.

## 5. Not verified (say so in your review, do not assume)
- Any real-phone behaviour: install, offline, keyboard, camera, store apps opening from links,
  foodpanda app handoff, Maps directions, "Use my location".
- Al-Fatah search result quality (page responds; results unseen); Carrefour link shape (marked
  `unverified`); pandamart only works by copy-then-open (foodpanda returns 403 to scripts).
- Live Gemini: model `gemini-3.8-flash`, grounded search, JSON output, photo handling.
- The restaurant list has not been generated (no `app/public/eatout/moods.json`).
- "Frisky" snack spelling (Aly wrote "frisky" and "firstky"); both are searchable aliases.

## 6. Open items for Aly (not for Codex)
1. Run `npm run refresh:eatout` in `app/` with `NOOR_HOME_LAT=33.668`, `NOOR_HOME_LNG=73.075`
   (PowerShell: `$env:NOOR_HOME_LAT = "33.668"; ...`), review `app/public/eatout/moods.json`, commit.
2. Create a Gemini key, then Settings, Save key, Test my key.
3. Real-phone pass of `docs/ACCEPTANCE-CORE.md`.
4. Settings, Remove sample pantry, before Noor starts.
5. Netlify free plan is credit based; each push to `main` is a deploy. Batch pushes.

## 7. Deferred on purpose (D-21)
Custom and Ramadan meal slots; menu-level matching for Korean wings and Donuts; shared household
access; family recipe photos. Not requested later: live prices, order amounts other than all/half.

## 8. How to review and report
- Run the three checks from `app/`: `npm run typecheck`, `npm test`, `npm run test:e2e`
  (set `PW_PORT` if another run is active). The browser tests use `page.clock.setFixedTime`
  for anything date dependent.
- Work on a branch `codex/<ticket>-<slug>`; do not push to `main` or force-push; Aly merges.
  Report findings with file:line, a failing input, and what you ran. Mark anything you did not
  run as "not verified".
- Decisions are in `docs/DECISIONS.md` (D-01 to D-23); plans in `docs/PLAN.md` and
  `docs/PLAN-SHOPPING.md`; acceptance status in `docs/ACCEPTANCE-CORE.md`; board in `.jaira/`
  (use the CLI; never `jaira init`).
