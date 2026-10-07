---
id: 01M4963GABCRZQA4Y2F6DRC2EX
title: "Fix independent-review defects AR01-AR16, A1, N1-N3, F1 with regression tests"
status: signoff
ready: true
creator: Aly Jafferani
assignee: Aly Jafferani
goal: "Remove the confirmed data-loss, recovery and boundary defects found by three independent reviews, each with a regression test that fails on the old code, so the app is safe to hand to Noor."
context: |-
  The core app was live on main 264de9b. Independent reviews (Codex adversarial 2026-10-06, then a deepseek pass) found 15 confirmed defects (AR01-AR16) plus a concurrency finding A1. Consequences today: deleting a cooked personal recipe made the app's own backup unrestorable; a second open tab silently deleted saved order costs, manual cart lines and settings; restore left old manual cart items behind; trip completion could split across two writes on a crash; the UI hid when a pending change had no durable copy; optional ingredients became required on edit; the open app stayed on yesterday's date after midnight; Gemini body timeout, physical-request rate counting, response-shape validation and UTF-8 size checks had gaps; ledger order, repayment validation and quantity overflow also failed targeted inputs.
  A fix pass on branch claude/review-fixes fixed all of them and added regression tests.
  A GLM 5.3 adversarial pass (audit/glm-2026-10-06-review.md) then found a NEW regression N1 (a settings clear lost through the JSON localStorage mirror) plus N2 (shopPrefs still a whole-record write) and N3 (a nested slotTimes edit overwrote the whole object). These were fixed: settingsPatch now carries deletions as an explicit remove list; shopPrefs saves field-level, per-key patches (shopPrefsPatch.ts); meal times send only the changed slot. A latent F1 (nested undefined diverging memory from the mirror) was also closed.
  GLM 5.3 third pass (audit/glm-2026-10-06-followup2.md) verdict READY: typecheck clean, 732/732 logic, 111/111 browser.
  Not committed before this ticket.
definition-of-done: "typecheck clean; npm test 732/732; npm run test:e2e 111/111; every AR01-AR16, A1, N1-N3 and F1 finding has a regression test that fails on the old code; GLM 5.3 third-pass verdict READY in audit/glm-2026-10-06-followup2.md"
tags:
  - p1
  - p2
blocked-by: []
related: []
commits: []
created-at: 2026-10-06T18:02:38Z
updated-at: 2026-10-07T11:52:29Z
updated-by: Aly Jafferani
outcome-resolves: 15 confirmed defects + A1 fixed with regression tests; GLM 5.3 third pass READY; merged to main and deployed
---

# Fix independent-review defects AR01-AR16, A1, N1-N3, F1 with regression tests

## Definition of Done

- [x] typecheck clean; npm test 732/732; npm run test:e2e 111/111; every AR01-AR16, A1, N1-N3 and F1 finding has a regression test that fails on the old code; GLM 5.3 third-pass verdict READY in audit/glm-2026-10-06-followup2.md
  proof: Verified 2026-10-06 on claude/review-fixes: npm run typecheck clean; npm test 732/732 (48 files); npm run test:e2e 111/111. GLM 5.3 third pass audit/glm-2026-10-06-followup2.md verdict READY.

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress
- **2026-10-06 18:03 · Aly Jafferani** — Fix pass built on claude/review-fixes on top of the two review commits (936df34, 65b658a). New storage helpers: arrayChange.ts (keyed list changes), settingsPatch.ts (JSON-safe settings remove list + nested merge), shopPrefsPatch.ts (field-level, per-key shop prefs). GLM 5.3 reviewed three times: first pass found N1 (blocking) plus N2/N3; second pass READY with N2 accepted; third pass READY after N2 and F1 were fixed properly. Physical phone, live Gemini key and live store links remain unverified; the work is committed here for Aly's signoff.
