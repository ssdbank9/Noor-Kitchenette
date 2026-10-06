# Noor's Kitchen — follow-up verification of the N1/N3 fixes (GLM 5.3), 2026-10-06

Follow-up to `audit/glm-2026-10-06-review.md` (verdict NOT READY, N1 blocking). Reviewer:
GLM 5.3, independent of the author. Aly Jafferani decides. This file is the only file I
created; no existing file, commit, branch or decision was touched. Scratch work went to the
system temp directory.

## 1. Snapshot

- Branch `claude/review-fixes`, HEAD `65b658a`, working tree dirty (fix pass still uncommitted,
  same 14 tracked files + new `app/src/storage/settingsPatch.ts` / `settingsPatch.test.ts`).
- New since my review: `settingsPatch.ts` (`SettingsPatchInput`, `applySettingsPatch`),
  `remove: string[]` on the `settingsPatch` write, partial `slotTimes` patches from the meal-time
  buttons, regression tests, e2e VF04, and the AR15 poll change.

## 2. Checks actually run (from `app/`)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **727 passed, 0 failed** (47 files) — was 723; +4 in `settingsPatch.test.ts` |
| `npm run test:e2e` (Chrome 390×844, Asia/Karachi) | **110 passed, 0 failed** (54.7 s) — was 109; +1 (VF04) |

## 3. N1 verdict — **fixed**

- `App.tsx:261-268` `changeSettings` splits the incoming patch into `remove` (keys whose value is
  `undefined`) and `set` (defined values), applies `applySettingsPatch` to state via a functional
  update, and enqueues `{ type: 'settingsPatch', patch: set, remove }`. Both real clearers still
  send `undefined` (`SettingsScreen.tsx:82` removeKey, `HomeAreaPanel.tsx:55` area cleared) and
  are converted before the queue, so the mirror never sees an `undefined`.
- `db.ts:237-243` `saveSettingsPatch(db, patch, remove)` does one `readModifyWrite`
  transaction applying `applySettingsPatch(current, { patch, remove })`; the write carries
  `remove` (`db.ts:286,313`).
- `applySettingsPatch` (`settingsPatch.ts`) deletes `remove` keys first, then sets/merges;
  `remove: string[]` is JSON-safe, so `saveQueue.ts:129`'s `JSON.stringify` mirror keeps it.
- Boot replay (`useKitchen.ts:46`) uses the same `applySettingsPatch`, and old-style pending ops
  with `undefined` in the patch still delete (compat path, unit-tested).
- Proof: unit test "keeps a removal through the JSON mirror (N1)" round-trips the op through
  `JSON.parse(JSON.stringify(...))` and asserts the keys are gone; e2e VF04 removes the Gemini
  key while IndexedDB is force-aborted, asserts the mirrored op is `{type:'settingsPatch',
  remove:['geminiKey']}`, reloads, and asserts the key is gone from both DB and UI. This is
  exactly the chain that failed before. The fix is the one I suggested (explicit removal list).

## 4. N3 verdict — **fixed**

`SettingsScreen.tsx:194-198` meal-time buttons send only `{ slotTimes: { [s.id]: shiftClock(...) } }`;
`applySettingsPatch` merges plain-object values one level (`{ ...before, ...value }`), so a stale
copy of the other slots cannot overwrite a second tab's edit to a different slot.
`changeSettings` also applies the patch to state with a functional update, so two rapid changes
in one tab compose. Unit test "merges a partial slot-time edit and keeps the other slots (N3)"
covers the two-tab sequence. Same-slot concurrent edits remain last-write-wins, which is inherent
and acceptable.

## 5. AR15 test change — **legitimate, not masking a regression**

The change replaces an immediate `expect(page.evaluate(reviewNativeAborted)).toBe(true)` with
`expect.poll(...)`. The banner condition (`App.tsx` pending > 0 && mirrorError) can render from
the mirror failure while the native IndexedDB transaction's abort callback has not fired yet, so
the immediate read raced the abort and could fail spuriously. The poll still *requires* the abort
to fire (it times out and fails otherwise), and every product assertion after it is unchanged
(settings still 4 in the DB, mirror null, warning text matches /clos|reload|lost/, post-reload
value is 4). Nothing was weakened; the test is now deterministic where it was racy. I also
re-read the surrounding source and found no behaviour change that the poll could hide.

## 6. New findings

No new confirmed defects. Two latent notes, neither reachable from current UI code:

- **F1 (latent, low)** — the `remove` split in `changeSettings` is top-level only. A caller
  sending a nested `undefined` (e.g. `{ slotTimes: { lunch: undefined } }`) would keep it in
  memory but lose it through the JSON mirror, resurrecting N1 one level down. No caller can send
  this today (`shiftClock` always returns a string; `HomeAreaPanel` sends a top-level key). A
  one-line comment or a type that forbids `undefined` inside `slotTimes` would close it; not
  blocking.
- **F2 (note)** — in `applySettingsPatch`, a key named in both `remove` and `patch` is set (patch
  wins). `changeSettings` makes the two mutually exclusive, so this is only a documented
  semantics choice, and a sensible one.

Checked and clean: `remove`/`patch` split ordering; partial `slotTimes` type
(`SettingsPatchInput`); boot replay of old-shape ops (`settings` snapshot, `settingsPatch`
without `remove`, `undefined`-valued patch keys — though ops arriving via the mirror can never
carry `undefined` after `JSON.stringify`); `saveSettingsPatch` is one atomic `readModifyWrite`
transaction; the only `settingsPatch` construction site is `App.tsx:268`.

## 7. N2 ruling — **accepted as a documented limitation**

I agree `shopPrefs` remaining a whole-record snapshot write is acceptable for handover, and I do
not insist it be fixed first. Grounds: this is a single-user, single-device phone app; D-02 and
D-21 deliberately defer multi-device/multi-tab sync; the loss needs two simultaneous open tabs
touching shop prefs in the same window, which is not Noor's usage pattern; and every other
whole-snapshot write was converted, so this is a known remainder of a fixed class, not an
unknown. Recommendation: Aly records the acceptance in `docs/DECISIONS.md` (a decision, so it is
his to make, not mine), and any future multi-tab/multi-device work revisits it.

## 8. Not verified (cannot be verified in this environment)

Physical phone install, camera, keyboard, safe areas, device text scaling, background/resume,
real offline behaviour; live Gemini with a real key; live store/foodpanda/Maps handoffs; natural
IndexedDB quota exhaustion (tests force a native abort); whole-device power loss; a real Netlify
deploy/update; full branch coverage.

## 9. Verdict

**READY** — N1 is genuinely closed through the mirror (explicit `remove`, proven by VF04 and the
JSON round-trip unit test), N3 is fixed, the AR15 poll change is a legitimate race fix, no new
defects were found, and N2 is acceptable as a documented single-device limitation; the three
checks pass clean (typecheck, 727/727 unit, 110/110 e2e).
