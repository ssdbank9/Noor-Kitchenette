# Noor’s Kitchen — Claude fix handoff, 6 October 2026

**Verdict: not ready to hand to Noor as the finished app.** There are 15 independently confirmed defects. This follow-up adds AR14–AR16; AR16 confirms the earlier unresolved split-write risk. No product features, production code or decisions were changed. Aly merges.

Review branch: `codex/adversarial-review`. Reviewed app source: `264de9b2c855a4daaf88c22c32dfe1b9d8c97225`. The current live JavaScript/CSS hashes match the local build. The branch intentionally contains red regression tests.

## Verified test numbers

Typecheck is clean. Logic: **719 total, 707 passed, 12 failed**, 45 files. Browser: **107 total, 101 passed, 6 failed, 0 flaky, 0 skipped**. Every original **697 logic / 97 browser** case still passes. The 18 failing assertions belong to 15 distinct confirmed defects, not 18 different bugs. All six browser failures reproduce on retry. After the full run, AR15 was refined to demonstrate the actual loss on reload and checked again.

Coverage is **95.11% lines, 93.41% statements, 91.35% functions, 85.96% branches of the instrumented logic subset**. This is not whole-app/combined browser coverage. All 359 zero-count branches have a file/line/arm inventory in `audit/verification-2026-10-06-coverage-gaps.json`. All branches are **not verified**.

## What changed from the earlier verification status

- Live Netlify assets match. All six tabs fit at 390 × 844, with no horizontal overflow or page errors. Installability has only Chrome’s private-window restriction; actual phone installation is still pending.
- Live service-worker control and an offline reload with persisted synthetic settings pass. A changed worker on an isolated local server waits for confirmation, blocks reload while writes fail and preserves settings after a successful retry/update. No Netlify deployment was performed.
- Native transaction abort, retry and a real renderer crash/reopen replay pass. Recovery still has the separate UI bug AR07. A precise crash between trip writes reproduces AR16. Whole-device power loss is not proven.
- Actual localStorage exhaustion is verified. Natural IndexedDB quota exhaustion is not: this installed Chrome reports an active one-byte override yet commits a 10 MB incompressible allocation. A failed quota fixture is not counted as an app defect.
- The deployed restaurant list exists: **11 moods, 92 entries**, generated 5 October, identical to the local public file. One public I-8 cuisine request succeeds. HANDOVER’s missing-list claim is stale. Menu-level Korean wings/Donuts matching remains deferred by D-21.
- Al-Fatah’s browser rice search lands with HTTP 200 (script request got 429). Carrefour’s script rice search responds 200, but Chrome hit an HTTP/2 protocol error. foodpanda’s homepage works; one published restaurant link returns 403. Maps web entry responds 200. Phone/store-app handoffs and reliable search/menu results are not proven; no challenge was bypassed.
- Google’s current [official model catalogue](https://ai.google.dev/gemini-api/docs/models) lists `gemini-3.8-flash`. No real API key was entered for this review, so live Gemini/account behaviour and accuracy remain not verified.

## Ranked confirmed defects

### P1 AR01 — Deleting a cooked personal recipe makes the kitchen's own backup unrestorable

Location: `app/src/storage/backup.ts:211`.

Reproduce: Create/cook a personal recipe R002, delete it, export, then restore the exported file.

Observed: parseBackup returns ok:false because the preserved cook event references a recipe removed from the active book. A recipeName snapshot does not satisfy the validator.

Suggested fix: Keep a historical recipe tombstone/version, or explicitly validate historical references with their snapshots while resolving active plan references on deletion.

Failing test: `app/src/storage/adversarial-review.test.ts`.

### P1 AR14 — A second open tab silently deletes the first tab’s saved order cost

Location: `app/src/App.tsx:445`; related: `app/src/storage/db.ts:165`.

Reproduce: Open two tabs before either logs an order. In tab A save Review first order for Rs 2401; in tab B save Review second order for Rs 1200.

Observed: Both tabs display their new order and persist successfully. IndexedDB orderCosts contains only Review second order. The first saved order is lost. Reproduced in the full suite and its automatic retry.

Suggested fix: Save order additions/updates by stable ID in a transaction that reads the current saved collection, or reject stale writes using a revision check. Coordinate/reload other open tabs. Audit other whole-snapshot writes for the same risk; their failure is not claimed by this reproduction.

Failing test: `app/tests/e2e/verification-followup.spec.ts — AR14`.

### P1 AR07 — Recovered pending settings are saved but never applied to the booted UI

Location: `app/src/storage/useKitchen.ts:39`.

Reproduce: Persist a pending settings operation with defaultServings:7 while the saved database has 4; reopen the app.

Observed: IndexedDB becomes 7, but Settings shows 4. A subsequent whole-settings write built from the stale UI can overwrite recovered values.

Suggested fix: Apply settings operations in the pending-state reducer before creating KitchenStore; cover all KitchenWrite variants and preserve operation order.

Failing test: `app/tests/e2e/adversarial-review.spec.ts`.

### P2 AR02 — Restore clears the cart only on screen; old manual items return after reload

Location: `app/src/storage/db.ts:64`; related: `app/src/App.tsx:268`, `app/src/storage/backup.ts:153`.

Reproduce: Save a manual six-egg shopping line, restore a backup, open Shop (line gone), reload, open Shop again.

Observed: The six-egg line reappears. The shopping store is absent from backup data and replacement transactions; App only calls setShopList([]).

Suggested fix: Include the manual shopping list in backup/pre-restore-copy/replacement state. If restore intentionally clears it, at minimum clear it durably in the replacement transaction.

Failing test: `app/src/storage/adversarial-review.test.ts; app/tests/e2e/adversarial-review.spec.ts`.

### P2 AR16 — A crash between trip completion enqueues saves the purchase but not the shorter manual cart

Location: `app/src/App.tsx:372`; related: `app/src/App.tsx:373`, `app/src/storage/db.ts:179`, `app/src/storage/db.ts:237`, `app/src/storage/useKitchen.ts:63`.

Reproduce: Manual list contains 6 eggs; the active trip has 3 picked up. Save purchase. Pause immediately after localStorage mirrors tripDone, before enqueue(shopping), and crash the renderer with Chrome Page.crash. Reopen in the same context.

Observed: Recovery writes exactly one 3-egg purchase and clears the trip. The manual shopping list still says 6 eggs, rather than the remaining 3. This turns the previous unresolved split-write risk into a reproduced crash-boundary defect. Normal completion and normal replay still pass; no double purchase is claimed.

Suggested fix: Make tripDone one queued operation carrying event, cleared prefs and the resulting manual list. Mirror and commit all three together in one events/meta/shopping transaction, and apply all three during boot replay. Preserve stable trip IDs and compatibility with old pending operations.

Failing test: `app/tests/e2e/verification-trip-crash.spec.ts — AR16`.

### P2 AR15 — The UI hides that a pending change has no durable recovery copy

Location: `app/src/App.tsx:695`; related: `app/src/storage/saveQueue.ts:28`, `app/src/storage/saveQueue.ts:132`.

Reproduce: Fill localStorage to its actual Chrome limit (including the final partial KB), abort the native settings transaction before commit, and increase people usually eating from 4 to 5.

Observed: The setting is 5 only in memory. IndexedDB remains 4, and no pending mirror exists. The alert says only Not saved yet / Retry, despite save.mirrorError indicating the recovery copy failed. Reload loses the change. This uses an actual localStorage QuotaExceededError plus a deliberately aborted native IndexedDB transaction; it does not prove natural IndexedDB quota exhaustion.

Suggested fix: While pending > 0, show mirrorError and explicitly state that closing/reloading can lose the change. Give an actionable route to free space and retry; also surface mirror read failures when no pending operation could be recovered.

Failing test: `app/tests/e2e/verification-followup.spec.ts — AR15`.

### P2 AR10 — Editing a recipe silently turns optional ingredients into required ingredients

Location: `app/src/domain/recipeForm.ts:252`; related: `app/src/domain/recipeForm.ts:93`.

Reproduce: Open a recipe containing an optional ingredient, change only its name, and save.

Observed: The saved ingredient no longer has optional:true. Availability and the shopping basket now treat it as required.

Suggested fix: Carry the optional flag through the editor form and reconstruction, including rows that were not otherwise changed.

Failing test: `app/src/domain/recipeForm.adversarial.test.ts`.

### P2 AR08 — The open app does not refresh its household day at midnight

Location: `app/src/App.tsx:121`.

Reproduce: Leave Today open at Karachi 2026-10-05 23:59; advance to 2026-10-06 00:01 without another interaction.

Observed: The header stays Monday · 5 October. Day/time-derived plan and recommendation state has no clock-triggered refresh.

Suggested fix: Use a household clock state that updates at relevant boundaries and on visibility/focus resume, with deterministic midnight tests.

Failing test: `app/tests/e2e/adversarial-review.spec.ts`.

### P2 AR04 — The Gemini timeout stops when headers arrive, leaving a stalled response body unbounded

Location: `app/src/gemini/client.ts:95`; related: `app/src/gemini/client.ts:137`.

Reproduce: Fetch returns HTTP 200 headers immediately, but its JSON body never completes.

Observed: The abort timer is cleared before res.json(). A configured 10 ms timeout has not aborted the request after 50 ms.

Suggested fix: Keep the timeout and abort handling alive through body consumption/parsing; return a timeout GeminiError for a body abort.

Failing test: `app/src/gemini/client.adversarial.test.ts`.

### P2 AR06 — Automatic retries bypass the advertised physical-request rate limit

Location: `app/src/gemini/client.ts:126`; related: `app/src/gemini/client.ts:133`.

Reproduce: maxPerMinute:1, retries:1; first response is HTTP 503, second is HTTP 200.

Observed: Two HTTP requests are made inside the one-request window. At the default configuration, 12 calls can issue up to 24 HTTP requests.

Suggested fix: Reserve/check a rate-limit slot for every physical attempt, including retries, using the current time.

Failing test: `app/src/gemini/client.adversarial.test.ts`.

### P2 AR11 — Restore accepts a repayment amount that contradicts the all/half rule

Location: `app/src/storage/backup.ts:468`.

Reproduce: Import an order of Rs 2401 with repay:{option:'half',amount:1}.

Observed: Validation accepts it; owedTotal trusts the stored amount, so a restored half repayment is Rs 1 rather than Rs 1201.

Suggested fix: Validate repayment amount against the order cost and option using the same whole-rupee rule; reject contradictory backup values.

Failing test: `app/src/storage/adversarial-review.test.ts`.

### P2 AR09 — Malformed response envelopes bypass the structured error boundary

Location: `app/src/gemini/client.ts:137`; related: `app/src/gemini/client.ts:148`, `app/src/gemini/client.ts:152`, `app/src/gemini/client.ts:163`.

Reproduce: Return valid JSON null, content.parts:'invalid', or groundingChunks:{}.

Observed: The client throws raw TypeError values instead of GeminiError('bad-response'). The UI's generic catch prevents a demonstrated whole-app crash; structured classification/retry handling is lost.

Suggested fix: Runtime-validate the response object and each accessed array/entry before reading fields; reject malformed envelopes with a controlled error.

Failing test: `app/src/gemini/client.adversarial.test.ts (three failing cases)`.

### P3 AR03 — Equal timestamp stock checks are ordered by random ID rather than recorded sequence

Location: `app/src/domain/ledger.ts:41`; related: `app/src/domain/ledger.ts:34`.

Reproduce: At the same millisecond, record set-stock 5 with id z-first, then set-stock 2 with id a-second.

Observed: balances([first,second]) returns 5. ID ordering reverses which stock check wins. Production frequency is not established; the existing browser helpers avoid equal timestamps.

Suggested fix: Persist an explicit recording sequence (including legacy/import migration) so equal-time stock anchors have an authoritative order.

Failing test: `app/src/domain/ledger.adversarial.test.ts`.

### P3 AR05 — The request byte limit counts UTF-16 characters

Location: `app/src/gemini/client.ts:117`.

Reproduce: Set maxRequestBytes:500 and send 'نور'.repeat(100). The text alone is 600 UTF-8 bytes; the serialized request is 391 characters and 691 bytes.

Observed: The request is sent despite exceeding the byte cap. The corrected regression independently checks the UTF-8 payload size.

Suggested fix: Measure the serialized body with TextEncoder().encode(body).byteLength before sending.

Failing test: `app/src/gemini/client.adversarial.test.ts`.

### P3 AR13 — A finite quantity can overflow during conversion and poison saved stock

Location: `app/src/domain/units.ts:248`; related: `app/src/domain/units.ts:75`, `app/src/domain/pantryActions.ts:59`.

Reproduce: toBase(1e308,'kg',rice), or Bought more with the equivalent plain decimal input.

Observed: Conversion and the pantry event builder both return ok:true, with an Infinity movement. JSON serialization turns Infinity into null, which is not a valid saved movement delta.

Suggested fix: Reject non-finite converted/rounded results and impose a reasonable pantry input bound before event creation.

Failing test: `app/src/domain/units.adversarial.test.ts`.

## Instructions for the fix pass

Fix the P1 data-loss/recovery defects first, then P2 correctness/recovery/Gemini limits, then P3 boundary issues. Preserve these regression assertions; do not make the suite green by removing or weakening them. Run typecheck, logic and the full browser suite and report actual counts. Keep the fix on a separate owner-approved branch and do not merge without Aly. Do not change D-08’s phone-local-key decision, D-20’s model/confirmation rules or D-21’s deliberate deferrals.

Re-run from `app/`:

```text
npm run typecheck
npm test
npm run test:e2e
```

On Aly’s Windows installation use `C:\Program Files\nodejs\npm.cmd` if npm.ps1 points to the missing user npm CLI. Installed Chrome and permission to launch it outside the sandbox are needed for completed browser reports.

The public repo must contain no actual keys, .env files, private browser profiles or unnecessary raw test output. Reproducible audit scripts and synthetic regression tests are safe; raw JSON/browser artifacts were kept locally. No cloud sync is implemented by D-02/D-21; do not silently add it. Board validation still reports 11 missing-assignee warnings; no tickets were mutated by this review.

## Outstanding verification — label these not verified

- Physical Android/iPhone installation, actual camera permission/capture, keyboard, safe areas, device text scaling, background/resume and offline behaviour. Aly confirmed that he can run the checklist; no device result has been received.
- Live Gemini key validation, real photo/receipt accuracy, grounded dish/video lookup, actual account quota, billing cap and origin restrictions. The secure-key question is still unanswered. The model ID is listed in Google’s official catalogue; this is not a successful live API call.
- Carrefour’s actual browser/phone handoff (script HTTP 200, browser ERR_HTTP2_PROTOCOL_ERROR), reliable foodpanda restaurant handoff (sample restaurant HTTP 403), store-app opening, current prices/stock and actual Maps directions/GPS. No refusals were bypassed.
- Natural IndexedDB disk-space exhaustion. Chrome reported quota=1 and overrideActive=true but committed a real 10 MB incompressible write. Native transaction abort, actual localStorage exhaustion, retry and renderer-crash recovery are verified separately.
- Whole-browser/OS power-loss and phone force-kill recovery. Page.crash kills a real renderer; it does not simulate every OS/device shutdown mechanism.
- An actual new Netlify deployment/update on a physical phone. The current live asset hashes and live desktop offline reload were checked. A real replacement worker was tested on an isolated local origin without publication.
- 100% branch/function coverage and combined browser-plus-logic source coverage. The instrumented logic run has 359 zero-count branches, listed in verification-2026-10-06-coverage-gaps.json. UI coverage is not included in that percentage.

## Aly’s physical-phone and live-account checklist

Aly has confirmed he can run these. No phone result has been supplied yet. Perform them after Claude fixes the confirmed blockers, using synthetic data.

1. Use an Aly-owned test phone, with synthetic data. Record Android/iOS version, browser, date, app URL and pass/fail; do not make Noor pilot this unfinished build.

2. Open the HTTPS site; add/install it to the home screen; launch from its icon. Check icon/name, standalone display and all six tabs in portrait.

3. Open Pantry, exact quantity entry and the Snacks search. Show the software keyboard, scroll to Confirm, dismiss the keyboard and switch tabs. Check no controls or toast are hidden by the keyboard, home indicator or notch.

4. Increase device text size, then check tabs, steppers, dialog buttons and the undo toast without sideways scroll or clipped labels.

5. Turn airplane mode on after the first successful load. Relaunch the installed app, edit synthetic stock, cook/undo a meal, and reload. Saved data must remain; online lookup must give a useful offline message.

6. In Settings enter the Gemini test key privately, restrict it to the real app origin and set the account spending control approved in D-08. Never put the key in chat/Git/backup. Record only whether Test key succeeds and a redacted failure category.

7. For New groceries, Receipt and Check my pantry, allow camera permission, take/select a photo, inspect the editable draft and cancel it. No stock may change before Save. Repeat with camera permission denied and with an unreadable image; manual entry must remain usable.

8. Check a partly used package marked 5 kg. Check my pantry must not infer that 5 kg remains. Enter an actual test remainder yourself, save once and verify the amount.

9. Add two photos of the same grocery trip, including the same item twice. Confirm one merged item, save once and verify exactly one purchase. Cancel another draft and verify no stock change.

10. Test one bounded live dish search and one recipe/video candidate. Confirm the source link/date and draft ingredients; cancel first, then save a new personal recipe. Starter recipes must remain intact. This does not prove accuracy across all cuisines or photos.

11. Open Al-Fatah, Carrefour, a foodpanda restaurant and Maps from the app. Record landing/result/deep-link behaviour and any refusal. Do not place orders, pay or bypass a challenge. Current stock/prices require checking on the store’s own page.

12. Background the installed app, return after Karachi midnight and after a longer pause, then force-close/reopen it after a successful save. Check date, data and duplicate events. AR08 currently fails the midnight check; repeat after Claude fixes it.

13. After an owner-approved future Netlify release, leave the old installed version open. Check the update prompt, save pending changes, accept Update and verify data remains. No deployment was performed by this review.

## Evidence

Structured curated record: `audit/verification-2026-10-06-review.json`. Original review preserved: `audit/adversarial-2026-10-06-review.json`. Final raw reports: `verification-2026-10-06-logic.json` and `verification-2026-10-06-full-e2e.json`; local screenshot: `verification-2026-10-06-live-phone.png`. Live/network/probe evidence is in matching dated JSON files. Raw local files are not required in the public Git branch.
