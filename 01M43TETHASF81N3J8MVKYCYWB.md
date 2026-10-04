---
id: 01M43TETHASF81N3J8MVKYCYWB
title: "P0: app scaffold and test harness"
status: backlog
ready: true
creator: Aly Jafferani
goal: "An empty app that builds, installs as a PWA, and runs unit and phone-sized browser tests from the repo."
context: |-
  No app code exists yet; v3 is a single HTML file (sources/Noor_Kitchen_App_v3.html) with no tests.
  Codex's browser checks (audit/browser-review.cjs) load Playwright from Codex's private runtime folder and use absolute paths, so Claude cannot re-run them.
  Browser tests must run at 390 x 844, time zone Asia/Karachi, as Codex's did.
  Stack depends on D-01 (proposal: TypeScript, Vite, Vitest, Playwright).
definition-of-done: Test commands added to AGENTS.md
tags:
  - p0
blocked-by:
  - 01M43TE2G1C88AC7MNEJYCTCKZ
related: []
commits: []
created-at: 2026-10-04T16:02:54Z
updated-at: 2026-10-04T18:22:25Z
updated-by: Aly Jafferani
assignee: Aly Jafferani
claimed-by: X1CarbonPC-43200
claimed-at: 2026-10-04T18:22:25Z
---

# P0: app scaffold and test harness

## Definition of Done

- [ ] Test commands added to AGENTS.md
- [ ] One command runs unit tests and one runs browser tests, both documented in README.md
- [ ] Browser tests use 390 x 844 and Asia/Karachi
- [ ] App has a web manifest and service worker and passes an installability check in Chrome

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

