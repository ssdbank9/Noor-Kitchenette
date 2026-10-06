# Noor's Kitchen — independent adversarial review of the fix pass (GLM 5.3), 2026-10-06

Reviewer: GLM 5.3, independent of the model that wrote the fixes. Owner and sole decision
maker: **Aly Jafferani**. Main user: Noor. This file is the only file I created; no existing
file, commit, branch, ticket or decision was touched.

## 1. Snapshot reviewed

- Branch: `claude/review-fixes`, HEAD `65b658a` (= `codex/adversarial-review` tip; local `main`
  is `264de9b`). Working tree **dirty**: the fix pass is uncommitted (13 modified tracked files,
  plus untracked `app/src/storage/arrayChange.ts`, `app/src/storage/arrayChange.test.ts`,
  `app/tests/e2e/concurrency-review.spec.ts` and audit evidence).

## 2. Checks actually run (from `app/`, `C:\Program Files\nodejs\npm.cmd`)

| Check | Result (my run) |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **723 passed, 0 failed** (46 files) — was 719/12 failed before the fix; +4 new tests in `arrayChange.test.ts` |
| `npm run test:e2e` (Chrome 390×844, Asia/Karachi) | **109 passed, 0 failed, 0 flaky** (1.8 min) — was 107/6 failed; +2 new tests in `concurrency-review.spec.ts`; the known `eatout.spec.ts` clipboard test passed first try this run |

## 3. Per-defect verdicts (AR01–AR16, A1)

I read the changed source at each cited location and the regression test, and checked each test
asserts the defect's behaviour (it would fail on the old code — most of these tests were red on
this branch before the fix, per the two prior reviews, which I confirmed by reading the diffs).

| ID | Verdict | Source (fix) | Test that proves it |
|---|---|---|---|
| AR01 | **Fixed** | `storage/backup.ts:215` — a cook event's `recipeId` may dangle when `recipeName` exists; plan references still validated (`backup.ts:193`) | `storage/adversarial-review.test.ts` "AR01" |
| AR02 | **Fixed** | `storage/db.ts:66` (`ALL_STORES` incl. `shopping`) + `db.ts:496` (`queueReplacement` clears it) | `storage/shopping.test.ts` "cleared by replaceAll"; `storage/adversarial-review.test.ts` "AR02"; e2e `adversarial-review.spec.ts` "AR02" |
| AR03 | **Fixed** | `domain/ledger.ts:39-42,75` (`seq` on every new event), `:51` tiebreak, `db.ts:380` same tiebreak; old events (`seq` absent → 0) only matter on exact-ms ties | `domain/ledger.adversarial.test.ts` |
| AR04 | **Fixed** | `gemini/client.ts:72-100` — `res.json()` inside the abort window; body abort → `timeout` | `gemini/client.adversarial.test.ts` "AR04" |
| AR05 | **Fixed** | `gemini/client.ts:63,139` — `TextEncoder` byte length | `client.adversarial.test.ts` "AR05" |
| AR06 | **Fixed** | `gemini/client.ts:106-113` `reserveSlot()`, called per physical attempt (`:143,148`) | `client.adversarial.test.ts` "AR06" |
| AR07 | **Fixed** | `storage/useKitchen.ts:44-52` — boot reducer now applies `settings` and `settingsPatch` before the store is created | e2e `adversarial-review.spec.ts` "AR07" (uses the OLD `settings` op shape — also proves old-pending-op compatibility) |
| AR08 | **Fixed** | `App.tsx:125-138` — minute timer + `visibilitychange`/`focus`, full cleanup | e2e `adversarial-review.spec.ts` "AR08" (crosses midnight via `clock.fastForward`) |
| AR09 | **Fixed** | `gemini/client.ts:159-201` — envelope validated before every field read | `client.adversarial.test.ts` "AR09" (3 cases) |
| AR10 | **Fixed** | `domain/recipeForm.ts:97` (form carries `optional`) + `:255` (re-emitted) | `domain/recipeForm.adversarial.test.ts` |
| AR11 | **Fixed** | `storage/backup.ts:473-474` — `repayAmount(amount, option)` exact whole-rupee check; the app itself only ever writes `repayAmount` values, so its own backups still restore | `storage/adversarial-review.test.ts` "AR11" |
| AR13 | **Fixed** | `domain/units.ts:248-251` — non-finite converted result refused | `domain/units.adversarial.test.ts` |
| AR14 | **Fixed** | `storage/db.ts:197-201` `saveOrderCostsChange` (read-modify-write) + `App.tsx:465-469` diff | e2e `verification-followup.spec.ts` "AR14" |
| AR15 | **Fixed** (as reproduced) | `App.tsx:720-726` — banner shows `mirrorError` while pending | e2e `verification-followup.spec.ts` "AR15" (see finding N4 for the unimplemented half of the suggestion) |
| AR16 | **Fixed** | `App.tsx:392-397` one `tripDone` op carrying event + prefs + cart change; `db.ts:214-227` one transaction | e2e `verification-trip-crash.spec.ts` "AR16" (real `Page.crash` at the mirror boundary) |
| A1 | **Fixed as claimed** | `db.ts:120-124` `saveShoppingChange` + `App.tsx:320-323`; `db.ts:236-243` `saveSettingsPatch` + `App.tsx:260-266` | e2e `concurrency-review.spec.ts` CR01, CR02 (both pass) — see findings N2/N3 for the same class that remains |

Backward compatibility of boot replay (`useKitchen.ts:40-88`): old pending `settings` snapshot,
old `shopping`/`purchase` snapshots, old `tripDone` without `change` (default empty change,
`db.ts:218`), and mixes of old+new ops all replay in order; `applyArrayChange` is idempotent
(removal is set-based, upserts replace by key), so a replayed-then-retried op cannot double-apply.
`readModifyWrite` (`db.ts:414-437`) keeps the idb transaction alive across its awaited requests,
refuses to write before setup / on a schema-version mismatch, and aborts on error — each new path
(`shoppingChange`, `purchaseChange`, `orderCostsChange`, `settingsPatch`, `tripDone`) does exactly
one atomic transaction. `seq` is optional in backup validation (`backup.ts:163,329`), so old
backups still restore.

## 4. New findings

### Confirmed defects

**N1 (medium) — a pending `settingsPatch` that clears a field loses the clear through the
localStorage mirror.** `storage/saveQueue.ts:129` mirrors ops with `JSON.stringify`, which
drops properties whose value is `undefined`. `App.tsx:265` enqueues the raw patch, and two real
UI actions send `undefined`: `ui/HomeAreaPanel.tsx:55` (`onChange({ homeArea: undefined })`,
"Area cleared") and `ui/SettingsScreen.tsx:82` (`geminiKey: undefined`, key removed).

Exact failing input (demonstrated):
`JSON.stringify({version:1,ops:[{type:'settingsPatch',patch:{homeArea:undefined}}]})`
→ `{"version":1,"ops":[{"type":"settingsPatch","patch":{}}]}`.

Failure chain: the IndexedDB write fails (the exact situation the mirror exists for — native
abort, quota, or any op stuck pending behind a failed one) → user taps "Area cleared" / removes
the key → mirror stores an empty patch → reload → `useKitchen.ts:45` replays nothing, the retry
(`db.ts:317`) writes nothing, the mirror is cleared → the clear is silently lost and the UI
reverts to the old value, after the screen said "Area cleared." This is a **regression vs
`main`**: the old whole-settings snapshot mirrored completely and replayed correctly.
No test covers it: `arrayChange.test.ts` tests `saveSettingsPatch` directly against the DB, and
VF01/VF03 use `defaultServings` patches with no `undefined`.

Suggested fix: encode deletions explicitly — e.g. `{ type:'settingsPatch', patch, remove: string[] }`
or a `null`-means-delete sentinel — or fall back to a whole-settings snapshot whenever the patch
contains `undefined`. Add a replay test that mirrors a clearing patch and reloads.

**N2 (low, same class as AR14/A1, not claimed by any finding) — `shopPrefs` is still a
whole-record snapshot write.** `App.tsx:370-373` enqueues `{type:'shopPrefs', prefs: next}` →
`db.ts:204` `meta.put(prefs)`. Two open tabs: tab A snoozes a cart line, tab B starts a trip →
the later write silently drops the earlier change. Every other whole-snapshot write was
converted to a change; this one was missed.

**N3 (low) — `settingsPatch` merges top-level keys only; nested objects are replaced
wholesale.** `ui/SettingsScreen.tsx:195` sends `{ slotTimes: { ...p.settings.slotTimes, [s.id]: … } }`
built from the tab's own (possibly stale) settings. Two tabs shifting different meal slots in the
same window still lose one edit. CR02 only covers different top-level keys, so this is inside the
letter of A1 but not its spirit. Judgement call whether to fix now or accept.

### Suggestions / opinions (not defects)

- **N4** — AR15's suggested fix had a second half: "also surface mirror read failures when no
  pending operation could be recovered". The banner condition (`App.tsx:720`,
  `pending > 0 && mirrorError`) cannot show a mirror read failure with `pending === 0`
  (`saveQueue.ts:88-92` sets `mirrorError` with zero ops restored). A corrupt/unreadable mirror
  still silently discards last session's changes. The reproduced defect is fixed; this residual
  is a product decision for Aly.
- `diffByKey`'s `JSON.stringify` equality (`arrayChange.ts:57`) treats deep-equal rows with
  different key order as different, emitting a harmless (idempotent) extra upsert. A sorted-key
  compare would avoid needless writes. Duplicate keys in `current` leave earlier duplicates in
  place on upsert (`arrayChange.ts:42-49`) — unreachable with the current key disciplines.
- `changeList` (`App.tsx:320-323`) computes the diff from the render-captured `shopList` and
  calls `setShopList(next)` (not a functional update). Two `changeList` calls in one tick would
  diverge UI and DB; no current caller does this. `setShopList(prev => …)` with the diff inside
  would make it impossible.
- `reserveSlot` (`client.ts:106`) burns a slot even when the attempt then fails offline —
  pre-existing behaviour, arguably correct (it was a physical request).
- The e2e suite still has no test that replays a *new-shape* pending op (`settingsPatch`/
  `shoppingChange`) into the booted **UI** after a reload; VF03 checks the DB only and AR07 uses
  the old `settings` shape. One test would close the gap that let N1 through.
- `stock.spec.ts:71` (`page.clock.setFixedTime` at 10:00 Karachi): **legitimate test fix, not a
  hidden product problem.** The test requires "Show another" to produce a second recipe, which
  depends on the current meal slot having ≥2 cookable suggestions; without a fixed clock the
  outcome varies with the wall-clock hour of the run (late-night runs land on the breakfast
  slot). The slot-narrowing itself is intended product behaviour ("no biryani suggested for
  breakfast") and matches HANDOVER's own instruction to fix the clock in date-dependent tests.

## 5. Better options / feedback

- The `ArrayChange` design is the right call: it fixes the lost-update class at the storage
  layer without cross-tab messaging, and it composes with stale in-memory copies (a stale tab's
  diff can only add/replace/remove its own keys). Two places it could be simpler or more
  complete: (1) the `settingsPatch` `undefined`-means-delete convention is the one non-JSON-safe
  idea in the queue — replace it with an explicit `remove` list (also fixes N1); (2) `shopPrefs`
  wants the same treatment (N2), or a documented decision that one-tab-at-a-time is assumed.
- `readModifyWrite` duplicates `writeToSetUpKitchen`'s version check; consider sharing one
  helper so the two refusal messages cannot drift.
- `seq` (`ledger.ts:39`) is monotonic across reloads because it is floored at `Date.now()`; it
  can only regress if the system clock steps backwards, which `recordedAt` already shares. Fine.
- The AR16 fix (one op, one transaction, default empty change for old ops) is the cleanest of
  the changes reviewed.

## 6. Not verified (cannot be verified in this environment)

- Physical Android/iPhone install, camera, keyboard, safe areas, device text scaling,
  background/resume, real offline behaviour.
- Live Gemini with a real key (accuracy, quota, billing, origin restrictions); only mocked
  responses were exercised.
- Live store / foodpanda / Maps handoffs; store-app opening; current prices/stock.
- Natural IndexedDB quota exhaustion (Chrome's reported quota is unreliable here; the tests use
  a native transaction abort instead).
- Whole-device power loss / OS force-kill (renderer `Page.crash` is the closest proxy).
- A real Netlify deploy/update on a phone (VF02 covers an isolated local origin only).
- Combined browser+logic coverage and 100% branch coverage.

## 7. Verdict

**NOT READY** to hand over to Noor: all 16 confirmed findings (AR01–AR16, A1) are genuinely
fixed with strong regression tests, but the fix pass introduced one new silent-loss defect in
the very recovery path it was hardening (N1, a pending settings clear lost through the mirror),
which is small to fix and should land — with N2/N3 considered — before handover.

Aly decides. This review does not merge, deploy, or change any decision.
