# Core acceptance checklist

The core (D-16) is handed to Noor when every row below is **Pass** in all three columns
that apply. Evidence is a test name (browser tests in `app/tests/e2e/`, logic tests in
`app/src/**/*.test.ts`) or a dated real-phone check. Browser checks are simulated: Chrome
at 390 x 844, Asia/Karachi, on Aly's computer. They are not a substitute for the phone.

Status on 2026-10-05, branch `claude/P0-foundations` at `95478b3`:
logic tests 295/295, browser tests 28/28, typecheck clean, seed check OK.
Real phone: **not yet done** for any row.

Live site: https://endearing-zabaione-6c6cc1.netlify.app (Netlify, from `main` at `23510aa`).
Checked 2026-10-05 from desktop Chrome at 390 x 844, Karachi time (simulated, not a phone):
opens with the empty pantry; no Chrome installability errors; sample pantry, cook with
Haan and save; reload offline and the meal is still in History; no page errors.

## The six v3 defects

| Defect | Logic test | Browser test | Real phone |
|---|---|---|---|
| D1 search loses focus after one letter | n/a | Pass: "search focus regression: a full word stays in the box and focused"; "Recipes search keeps focus while typing" | Pending |
| D2 "500 g" read as 500 kg; negatives accepted | Pass: units.test.ts (D2 regression, negatives refused) | Pass: "an unusable amount is refused"; "Exact amount rejects blanks and negatives" | Pending |
| D3 undo leaves the meal in history and totals | Pass: ledger.test.ts "restores stock AND removes the meal" | Pass: "cooking deducts exactly the recipe amounts, and undo puts every one back" | Pending |
| D4 "in pantry" ticked at zero after undo | Pass: ledger.test.ts D4 | Pass: "Bought more ... and Undo restores it" | Pending |
| D5 1:30 a.m. meal filed in the wrong month | Pass: localDate.test.ts, ledger.test.ts D5 | Pass: "shows the date in Karachi time" | Pending |
| D6 failed save hidden and lost | Pass: saveQueue.test.ts D6 regression | Pass: "a cooked meal is still in History after a reload" | Pending (simulate storage full) |

## Core features

| Feature | Evidence | Real phone |
|---|---|---|
| Starts empty, sample pantry optional (D-18) | "a fresh start shows the empty pantry"; "loading the sample pantry ... can be removed"; "Undo on the sample pantry toast" | Pending |
| 22 recipes, 62 ingredients, 276 rows imported (F9, F38) | seed.test.ts counts and content; `node tools/build_seed.cjs --check` | n/a |
| Suggested next meal with reasons (F81) | suggest.test.ts; Today shows suggestion after sample pantry | Pending |
| Ready / almost there / check stock (F4, F5, F7) | suggest.test.ts; Recipes list badges | Pending |
| Recipe scaled to people, stock rechecked (F2, F3) | "opening another recipe shows that recipe's own ingredients, and the people count rescales them" | Pending |
| Original recipe link primary, better-rated as "Alternative version" (F13, F14, F78 core part) | RecipeScreen (manual check) | Pending |
| Cooked: date strip, time, meal, people, rating (F17-F20, F82) | CookedScreen.test.ts; e2e cooking flows | Pending |
| Used less or more than the recipe (F61) | usage.test.ts; "Nahi: adjust one ingredient to None and another to more, stock follows, undo restores" | Pending |
| Over-use shows "check stock", never negative | ledger.test.ts (+1000, -1500, +1000) | Pending |
| Pantry: bought, checked, not sure, used, finished, threw away, undo (F22, F23, F56, F59, F62, F68) | pantryActions.test.ts; pantry.spec.ts (6 tests) | Pending |
| History with undo, monthly totals by meal and dish (F17, F47, F48, F77, F79 core part) | ledger.test.ts; persist.spec.ts | Pending |
| Shopping list: + List, combined lines, low-stock top-ups, bought amount, share (F33, F35, F36, F24) | shopping.test.ts; shop.spec.ts; shoplist.spec.ts | Pending (share sheet) |
| Settings: Gemini key on phone only, Haan/Nahi words, people, meal times (D-08, D-18) | settings.spec.ts | Pending |
| Backup and restore, malformed file refused, key never exported (F45, F46, F74) | backup.test.ts; settings.spec.ts restore tests | Pending (file download on phone) |
| Survives reload; works offline (F44, F75 core part) | persist.spec.ts; offline.spec.ts | Pending |
| Installable; safe update banner (F51) | shell.spec.ts installability; canUpdateNow.test.ts | Pending: install from Netlify, update banner on a real update |

## Real-phone checklist (to run before handover)

On Noor's phone model and browser, from the Netlify address:
1. Install to the home screen; opens full screen with the icon.
2. Go offline (flight mode), reopen: recipes and saved data are there.
3. Cook a dish with Haan, then one with Nahi and adjusted amounts; check Pantry; undo both.
4. Pantry: each of the five actions once; search with the phone keyboard.
5. Shop: + List, buy one item, share the list to WhatsApp.
6. Settings: save a backup file, restore it; enter and remove a test Gemini key.
7. Publish a small change; the "new version" banner appears and updates only on tap.

## Not in the core (later updates, D-16)

Gemini photo pantry and new-dish lookup (P2), eat-out and order by mood (F83, F84),
weekly planner and basket (P3), kitchen depth (P4), shared household (P5).
