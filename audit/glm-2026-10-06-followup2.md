# Third-pass verification — N2 removed, F1 closed (GLM 5.3, 2026-10-06)

Third pass. First pass (`glm-2026-10-06-review.md`): NOT READY, N1. Second pass
(`glm-2026-10-06-followup.md`): READY with N2 accepted as a documented limitation. The author
then chose to fix N2 properly and close the latent F1 instead of documenting them. This pass
re-verifies those two changes and hunts for new defects. Read-only: no source, test, doc or
board file was modified; scratch tests ran from the system temp dir only.

## Snapshot

- Branch `claude/review-fixes`, HEAD `65b658a` (test(review): verify crash recovery and
  concurrent writes), working tree carries the fixes as unstaged modifications plus new
  untracked files (`shopPrefsPatch.ts`, `settingsPatch.ts`, `arrayChange.ts`, their tests,
  `concurrency-review.spec.ts`).
- Files reviewed in full: `app/src/storage/shopPrefsPatch.ts`, `arrayChange.ts`, `db.ts`,
  `useKitchen.ts`, `settingsPatch.ts`, `App.tsx` (save/done paths), `domain/trip.ts`,
  `domain/cart.ts` (dismissals), `domain/shopPrefs.ts`, `domain/types.ts`, `ui/StoreChip.tsx`,
  `ui/ShopScreen.tsx` (snooze/start-trip paths), `ui/SettingsScreen.tsx` (slotTimes path),
  all three new/changed test files, `saveQueue.ts` (mirror), `git diff` against HEAD for the
  old (pre-fix) behaviour.

## Actual numbers (run from `app/`)

- `npm run typecheck` — clean (tsc --noEmit, no output).
- `npm test` — **732/732 passed**, 48 test files.
- `npm run test:e2e` — **111/111 passed** (1.0m), including CR01, CR02, CR03
  (`concurrency-review.spec.ts` re-run alone: 3/3 in 13.9s).
- Extra scratch verification (temp dir only, not in the repo): 9 edge-case tests against the
  real `diffShopPrefs`/`applyShopPrefsPatch` — all 9 passed (empty patch, removals, `trip: null`
  vs omitted, JSON-mirror round-trip, idempotency, composition in both orders, same-key
  collision, cross-tab trip finish, whole-value `stores`).

## N2 verdict: FIXED (limitation genuinely removed)

- `savePrefs` (App.tsx:374-380) now enqueues `{type:'shopPrefsPatch', patch: diffShopPrefs(prefs, next)}`;
  `saveShopPrefsPatch` (db.ts) is a read-modify-write on the stored `shopPrefs`, so only the
  fields a tab actually changed are written. `preferred` and `dismissed` are keyed
  `ArrayChange`s, so per-key edits from two tabs compose.
- Verified two tabs editing different fields both survive: unit tests in
  `shopPrefsPatch.test.ts` (snooze + trip, two preferred keys) and my scratch composition test
  (dismissed + preferred + trip from two stale copies, both application orders). Per-key
  removals only name keys the writing tab itself removed, so a concurrent *addition* by the
  other tab is never erased (checked explicitly: another tab's `Garlic` dismissal survives a
  patch that removes `Onion`).
- CR03 would fail on the old code: `git diff` confirms the old `savePrefs` enqueued
  `{type:'shopPrefs', prefs: next}` (whole record) and the old `tripDone` wrote the caller's
  whole `prefs`. In CR03 tab B loads before tab A snoozes, so tab B's whole-record start-trip
  write would clobber the snooze; `readShopPrefs` would then not see `Buldak_Noodles` in
  `dismissed`. With the patch, CR03 passes.
- `doneShopping` (App.tsx:390-403) passes `shopPatch: diffShopPrefs(prefs, r.prefs)` on the
  `tripDone` op; `saveTripDone` (db.ts) applies it to the CURRENT stored prefs, and the manual
  list reduction is now a keyed change on the same op (previously a separate whole-list
  `shopping` op — this is an improvement, see AR16 below).

## F1 verdict: FIXED (latent case closed)

- `applySettingsPatch` (settingsPatch.ts:23-34): when merging a nested plain object, a nested
  `undefined` value is skipped, so it is never written. In-memory and the JSON localStorage
  mirror (which drops nested `undefined` before serialising) now produce identical results.
- Verified by the new test in `settingsPatch.test.ts` ("ignores a nested undefined so memory
  and the mirror agree"): direct application and application of the JSON-round-tripped patch
  both leave `slotTimes.lunch` unchanged. Note the fix is defensive: `changeSettings`
  (App.tsx:262-270) strips top-level `undefined` into `remove`, and `SettingsScreen.tsx:198`
  only ever sends concrete string slot times, so no current UI caller can send a nested
  `undefined`. The invariant (memory == mirror) now holds for any patch, which is what F1 asked.

## New-defect hunt (nothing blocking found)

Checked and clean:

- **AR16 atomicity, no regression — improved.** `saveTripDone` is one `readModifyWrite`
  transaction over `events`, `meta`, `shopping` (db.ts:246-261): event + cleared trip + reduced
  manual list commit together. The old code wrote the list reduction as a *separate* `shopping`
  op (old App.tsx:372-373), so the new code is strictly more atomic than before.
- **Old pending ops still replay.** `tripDone` without `shopPatch` falls back to the whole
  `prefs` in both `saveTripDone` (db.ts) and the boot replay (useKitchen.ts:53-56); covered by
  `extras.test.ts` (old-format `tripDone` written twice, one event, trip cleared once) and the
  old `type:'shopPrefs'` whole write still round-trips. Old `tripDone`+`shopping` op pairs
  replay in order (boot applies ops oldest-first in one pass; `shopping` whole-list snapshot
  replay is harmless).
- **Replay order for mixed old/new ops.** The boot loop applies pending ops in queue order
  (chronological), so an old whole `shopPrefs` op (only ever older) precedes newer
  `shopPrefsPatch`/`tripDone` patches; patches compose onto whatever the previous op produced.
- **No UI caller still depends on the whole-`prefs` write.** `saveShopPrefs`/`type:'shopPrefs'`
  is retained only to replay old pending ops; App.tsx is the only enqueue site and uses
  `shopPrefsPatch` exclusively.
- **Edge cases (scratch-verified):** empty patch is a harmless no-op and JSON-safe; `trip: null`
  clears, omitted `trip` leaves the stored trip alone, both survive the JSON mirror; applying
  the same patch twice is idempotent; two patches to different fields compose identically in
  either order; same-key collision is a clean last-write-wins per key with no duplication;
  removals never touch keys the writing tab never saw.

Observations (not defects, no action required):

1. **Negligible, cross-tab semantics:** if tab B adds a dismissal for an item *after* tab A's
   trip copy was taken and that item is picked, `finishTrip`'s patch (diffed against tab A's
   stale copy) does not name it, so the dismissal survives the purchase. Single-tab semantics
   would clear it. Impact is cosmetic (a snooze expires; a `removed` dismissal recorded at
   pre-purchase stock hides nothing once stock is replenished). shopPrefsPatch.ts + trip.ts.
2. **Note:** `stores` and `trip` remain whole values (documented in shopPrefsPatch.ts:8-9), so
   two tabs editing the *same* field still last-write-wins. That is the accepted design, not N2.
3. **Note:** `savePrefs` would enqueue an empty `shopPrefsPatch` if ever called with an unchanged
   prefs; that is a harmless no-op write and no current caller does it (all callers build a
   changed `next` or guard with `!==`).

## Not verified

Physical phone, live Gemini API, live store links (search URLs still unverified/`unverified`).

## Verdict

**READY** — N2 is genuinely fixed (field-level, per-key merging patches applied to the stored
value, CR03 proves the old whole-record write would fail) and F1 is closed (nested `undefined`
can no longer make memory and the mirror disagree), with typecheck clean, 732/732 logic and
111/111 e2e tests passing and no new defects found.
