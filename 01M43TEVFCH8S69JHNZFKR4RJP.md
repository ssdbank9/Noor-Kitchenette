---
id: 01M43TEVFCH8S69JHNZFKR4RJP
title: "P0: visible saving, backup and validated restore"
status: backlog
ready: false
creator: Aly Jafferani
goal: "No edit is ever silently lost, and a backup can be restored safely."
context: |-
  v3 wraps localStorage.setItem in catch(e){} (sources/Noor_Kitchen_App_v3.html line 121). A failed save looks fine on screen and is lost on reload (D6).
  Codex tested a valid backup/restore in v3; a malformed backup was never tested.
  Feature rows: F44, F45, F46, F74.
definition-of-done: Current data is kept before a restore replaces it
tags:
  - p0
blocked-by:
  - 01M43TETSY6WV1M9SPVF54N99P
related: []
commits: []
created-at: 2026-10-04T16:02:55Z
updated-at: 2026-10-06T18:12:26Z
updated-by: Aly Jafferani
---

# P0: visible saving, backup and validated restore

## Definition of Done

- [x] Current data is kept before a restore replaces it
  proof: app/src/storage/db.ts replaceAllKeepingCopy / PreRestoreBackup
- [x] Test: simulated storage failure shows an error and keeps the change for retry (D6)
  proof: app/src/storage/saveQueue.test.ts (storage failure shown, change kept for retry, D6)
- [ ] Backup includes schema version, pantry, recipes, plans, events and settings
- [ ] Test: malformed backup is rejected and current data is unchanged

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

