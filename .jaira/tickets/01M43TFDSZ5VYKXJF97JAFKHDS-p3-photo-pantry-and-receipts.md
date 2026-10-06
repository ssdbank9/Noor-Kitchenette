---
id: 01M43TFDSZ5VYKXJF97JAFKHDS
title: "P2: Gemini - new-dish lookup, internet recipes, photo pantry"
status: done
ready: true
creator: Aly Jafferani
goal: Photo of groceries or a receipt becomes an editable draft; Noor reviews and saves; one purchase never changes stock twice.
context: "v3 has no recognition; the Excel used an external photo-to-Claude helper (F30). Needs D-03 (provider, key held in a server function, photo privacy). Rows: F28-F30, F52, F57, F73. Camera on a real phone is untested."
definition-of-done: "Test: a receipt and a grocery photo of the same shop change stock once"
tags:
  - p3
blocked-by:
  - 01M43TEV902MGP88SF35823HWF
  - 01M43TETSY6WV1M9SPVF54N99P
  - 01M43TEV1ABBQ0T3RHJVE4434X
  - 01M43TE2G1C88AC7MNEJYCTCKZ
related: []
commits: []
created-at: 2026-10-04T16:03:14Z
updated-at: 2026-10-06T18:19:36Z
updated-by: Aly Jafferani
outcome-what: "Gemini photo pantry, new-dish lookup and internet recipes (P2/P3)"
outcome-why: Implemented; server-key and live criteria superseded by D-08 and internal acceptance
outcome-resolves: Implementation DoD met; live/device items superseded to internal acceptance
assignee: Aly Jafferani
---

# P3: photo pantry and receipts

## Definition of Done

- [x] Test: a receipt and a grocery photo of the same shop change stock once
  proof: app/tests/e2e/snap.spec.ts (receipt + groceries of one shop merge to one line; stock rises once)
- [-] Gemini key on the phone only (D-08; superseded the server-function plan)
  proof: D-08 (2026-10-05): phone-local key, no server function
- [-] New-dish flow implemented (ingredients matched, stock check, recipe and video, review before saving); live accuracy owned by internal acceptance
  proof: Implementation + mocked tests done; live Gemini accuracy/timing unverified, owned by internal acceptance
- [-] Ranked internet recipe/video implemented; live ranking owned by internal acceptance
  proof: Implementation + mocked tests done; live ranking unverified, owned by internal acceptance
- [x] Typing 'korma', 'qorma' or the Urdu name finds the same dish; Noor picks from a short list of matches, and an existing dish is offered before a duplicate is created (F80)
  proof: app/src/domain/dishMatch.test.ts; app/src/gemini/dish.test.ts (spelling-tolerant match, existing dish offered)

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress
- **2026-10-04 17:19 · Aly Jafferani** — 2026-10-04: Aly made photo recognition a must-have and chose Gemini (D-03). Moved from P3 to P2, before the pilot. Can be built alongside P1 once P0 is done; needs the hosting decision (YCTCKZ) because Gemini needs a server function.
