# Noor's Kitchen — independent adversarial review (deepseek), 2026-10-06

Reviewer: independent verification pass (Claude/DeepSeek model), separate from Codex.
Owner and sole decision maker: **Aly Jafferani**. Main user: Noor.
This file is **new dated evidence**. No existing audit file was edited; nothing was merged,
pushed, deployed, or changed in production code or `docs/DECISIONS.md`.

## 1. Snapshot reviewed

- Repository: existing local folder `C:\Users\Aly Jafferani\Documents\ChatGPT\Noors Kitchen`
  (no new clone or worktree was created for this review).
- Remote: `https://github.com/ssdbank9/Noor-Kitchenette.git`.
- Branch: **`codex/adversarial-review`**.
- Commit: **`65b658aec0389fbac2d15f0b98d90d3eb667e325`** — matches the prompt's snapshot exactly.
- Working tree on entry already contained an uncommitted edit to `pending-global-mistakes.md`
  and untracked dated audit evidence; all of it was preserved.

## 2. Checks actually run (from `app/`)

Environment wrinkle: this shell has `NODE_ENV=production`, so the first `npm install` omitted
devDependencies and pruned the toolchain. Re-ran with `--include=dev` (only the gitignored
`node_modules/` was touched; `package.json` and `package-lock.json` were not modified).

| Check | Result (my run) |
|---|---|
| `npm run typecheck` | clean |
| `npm test` (Vitest) | **719 total, 707 passed, 12 failed** (45 files) |
| `npm run test:e2e` (Chrome 390×844, Asia/Karachi) | **107 total, 100 passed, 6 failed, 1 flaky, 0 skipped** |

These match Codex's numbers except one benign difference: the browser run counted the known
`eatout.spec.ts` clipboard test as **flaky** (passed on its automatic retry) rather than passed.
That is the flakiness already noted in `docs/HANDOVER.md`, not a new failure.

Failures map exactly to Codex's regressions:

- Browser failures (6): `AR07`, `AR08`, `AR02`, `AR14`, `AR15`, `AR16`.
- Logic failures (12): `AR01`, `AR02`, `AR03`, `AR04`, `AR05`, `AR06`, `AR09` (×3), `AR10`, `AR11`, `AR13`.

Every original 697 logic / 97 browser case still passes.

## 3. Verdict on Codex's 15 findings

I read the cited source at each location and re-ran the failing tests. **All 15 are Confirmed.**
None is an incorrect expectation, a fixture/environment failure, or already fixed.

| ID | Pri | Verdict | Where | Why it is real (verified in code) |
|---|---|---|---|---|
| AR01 | P1 | Confirmed | `storage/backup.ts:211` | Validator requires every `event.meal.recipeId` to still exist in `recipes`. Deleting a cooked personal recipe (`withoutRecipe`, `recipeForm.ts`) leaves the cook event dangling, so the app's own export fails `parseBackup`. A `recipeName` snapshot is not enough. |
| AR14 | P1 | Confirmed | `App.tsx:445`; `storage/db.ts:165` | `orderCosts` is written as a whole list (`saveOrderCosts` → `meta.put(list,'orderCosts')`). Two tabs each build from their own copy → last write wins, first order lost. Reproduced e2e both attempts. |
| AR07 | P1 | Confirmed | `storage/useKitchen.ts:39` | `boot()`'s pending-op reducer handles recipe/deleteRecipe/ingredient/orderCosts/shopPrefs/tripDone/plan/leftovers/batches/favourites but has **no `settings` branch**, so a recovered settings op is written to IndexedDB (`queue.retry()`) yet never applied to the booted UI. |
| AR02 | P2 | Confirmed | `storage/db.ts:64`; `backup.ts:152-153,65` | `ALL_STORES` (used by `replaceAll`/`replaceAllKeepingCopy`) excludes `shopping`; `queueReplacement` never clears it; export/FILE_FIELDS omit the manual list. Restore clears only the in-memory list, so the old manual lines return on reload. |
| AR16 | P2 | Confirmed | `App.tsx:372-373`; `db.ts:179` | Trip completion is **two** enqueues: `tripDone` (event + prefs, one transaction) then `shopping` (list). A crash between them saves the purchase and clears the trip but leaves the manual cart unreduced. |
| AR15 | P2 | Confirmed | `App.tsx:695` | The save banner is hard-coded "Not saved yet" + Retry; `save.mirrorError` is never rendered. With pending > 0 and no durable mirror, the UI does not warn that closing loses the change. |
| AR10 | P2 | Confirmed | `domain/recipeForm.ts:90-95, 252` | `formFromRecipe` builds rows without `optional`, and `recipeFromForm` rebuilds each line as `{ ingredientId, amount, unit }`. Editing any recipe silently drops `optional: true`. |
| AR08 | P2 | Confirmed | `App.tsx:121` | `const now = new Date()` is evaluated per render; there is no timer or visibility/focus handler, so an idle open page keeps yesterday's date and day-derived state. |
| AR04 | P2 | Confirmed | `gemini/client.ts` `once()` | The abort timer is cleared in `finally` when `fetch` resolves (headers), before `res.json()` runs. A stalled body is unbounded. |
| AR06 | P2 | Confirmed | `gemini/client.ts:126` | The per-minute slot is checked once before the initial `once()`; the retry loop calls `once()` again without reserving another slot, so a retry is a second physical request inside the window. |
| AR11 | P2 | Confirmed | `storage/backup.ts:468` | `repay.amount` is validated only as an integer ≥ 0; it is never checked against `amount`/`option`. A restored `{option:'half', amount:1}` on a Rs 2401 order is accepted and `owedTotal` trusts it. |
| AR09 | P2 | Confirmed | `gemini/client.ts:137+` | `data`, `candidate`, `parts` and `groundingChunks` are dereferenced without runtime validation (`data.promptFeedback` on `null`, `.map` on a string/object). Malformed envelopes throw raw `TypeError`, not `GeminiError('bad-response')`. |
| AR03 | P3 | Confirmed | `domain/ledger.ts:41` | `byRecorded` orders by `recordedAt ?? at`, then falls back to `byTime`, which breaks equal timestamps by **random `id`**. Two same-millisecond `set-stock` anchors can resolve in the wrong order. Only cooking sets `recordedAt` (`App.tsx:169`); other builders rely on `at`, so equal-time collisions are possible though rare. |
| AR05 | P3 | Confirmed | `gemini/client.ts:117` | `if (body.length > maxBytes)` counts UTF-16 code units, not UTF-8 bytes. A request under the character cap but over the byte cap is sent. |
| AR13 | P3 | Confirmed | `domain/units.ts:248` (`converted`); `pantryActions.ts:58-60` | `toBase` checks only that the *input* is finite; `amount * factor` can overflow to `Infinity`, and `converted()` returns it as `ok: true`. `buildPantryEvent` passes it through, so an `Infinity` movement reaches the event (JSON turns it into `null`). |

## 4. Additional findings (ranked most serious first)

### A1 — The concurrent-tab lost update is not limited to order costs (medium)

Codex's AR14 explicitly left the other whole-snapshot writes unclaimed. I confirmed the same
root cause in two more places, both of which lose data when two tabs are open:

- **Manual shopping list** — `App.tsx:299-301` (`changeList`: `setShopList(next)` +
  `enqueue({type:'shopping', list: next})`) → `storage/db.ts:107` writes the whole list.
- **Settings** — `App.tsx:245` (`enqueue({type:'settings', settings: next})`) → `db.ts:186`
  writes the whole settings object.

Wrong: each tab serialises its own stale in-memory copy; the later write silently drops the
earlier tab's change.

Reproduction (now a targeted, deterministically failing e2e test):
`app/tests/e2e/concurrency-review.spec.ts`.
- **CR01** two tabs each add one manual cart line (Lemon in tab A, Tomato in tab B).
  Actual: IndexedDB `shopping` list contains only `["Tomato"]`. Expected: both.
- **CR02** tab A raises people-count to 5; tab B changes breakfast time.
  Actual: saved `defaultServings` reverts to 4. Expected: 5 and `slotTimes.breakfast='08:15'`.

Observed output from my run (both attempts, not flaky):
`Expected value: "Lemon" / Received array: ["Tomato"]`, and `Expected: 5 / Received: 4`.

Suggested fix: as with AR14 — read-modify-write the collection inside one transaction keyed by
stable id/revision, or reject stale writes; coordinate/reload other tabs (e.g. BroadcastChannel
or `storage` events).

### A2 — `readOrderCost` does not enforce the live app's own ceiling (low)

`domain/orderCosts.ts` defines `MAX_ORDER_RS = 1_000_000` and `newOrderCost` rejects larger
amounts, but `storage/backup.ts:464` validates `amount` with `{ integer: true, min: 1 }` and
**no maximum**. A backup can restore an order larger than the app would ever let Noor enter.

This is an observation, **not** asserted as a confirmed defect and deliberately not given a red
test: a backup legitimately carries the user's own data, and the cap is a UI guard, so the
correct behaviour is a product decision for Aly, not a clear bug.

### A3 — The pre-restore copy cannot recover the manual shopping list (low; extension of AR02)

`PreRestoreBackup` stores `KitchenData` (`db.ts:32-36`), which excludes the shopping store.
So even the "keep the current kitchen before replacing it" safety copy (F46/F74) cannot bring
back the manual cart after a mistaken restore. Same root as AR02; no separate test.

No other distinct high-severity defect was found beyond Codex's 15 and the instances above.

## 5. Deliberately deferred / not defects

- **D-08 phone-local Gemini key** — absence of a server proxy is an approved decision, not a
  finding. `withoutSecrets` strips `/key|token/i` fields from backups (`backup.ts:81-89`), and
  the key is sent in the `x-goog-api-key` header, never a URL. Consistent with D-08/D-20.
- **AR12 (cookability with `needsCheck`)** — Codex's rejection stands; the ledger intentionally
  keeps a guaranteed lower bound after a measured purchase.
- **D-02 / D-21 deferrals** (shared household sync, menu-level mood matching, custom/Ramadan
  slots, family recipe photos) — deliberate scope, not defects and not authority to build.

## 6. What I verified, how, and what remains not verified

Verified: branch/commit match; the three checks above on real execution; each of the 15 findings
read at its cited source line; the two new concurrency instances reproduced with failing e2e
tests (`concurrency-review.spec.ts`).

**Not verified (explicitly):**
- Physical Android/iPhone install, camera, keyboard, safe areas, background/resume, device text
  scaling, real offline behaviour.
- Live Gemini: real key, photo/receipt accuracy, grounded lookup, quota/billing/origin limits.
- Live store / foodpanda / Maps handoffs and search quality.
- Natural IndexedDB quota exhaustion (only native transaction abort + real localStorage exhaustion
  are covered); OS power-loss / phone force-kill recovery; a real Netlify deploy/update on a phone.
- 100% branch/function coverage and combined browser+logic coverage. Codex's 85.96% is the
  instrumented logic subset only.

## 7. Changes made by this review

- Added `app/tests/e2e/concurrency-review.spec.ts` (2 red regression tests for A1).
- Added this file `audit/deepseek-2026-10-06-review.md`.
- No production code, dependencies, decisions, or older audit files changed. Nothing staged,
  committed, pushed, merged, or deployed.

## 8. Verdict

**Not safe to hand to Noor as the finished app.** The P1 items are data-loss/recovery defects —
AR01 (the kitchen's own backup becomes unrestorable after deleting a cooked personal recipe) and
AR14 (+ A1, silent cross-tab loss of order costs, cart lines and settings) — and the AR02/AR16/AR15
recovery gaps leave the UI and stored data inconsistent. Fix these, keep the red regression tests
green, then complete the physical-phone and live-Gemini acceptance before handover.

Aly decides. This review does not merge, deploy, or change any decision.
