---
id: 01M43TETSY6WV1M9SPVF54N99P
title: "P0: event ledger, quantities and local dates"
status: done
ready: true
creator: Aly Jafferani
goal: "The data model every later feature writes through: events, stock movements, quantities with units and basis, household-local dates."
context: |-
  v3 keeps pantry snapshots only. That causes D3 (cooking undo leaves the meal in history and stats) and D4 (purchase undo leaves 'in pantry' ticked at zero).
  v3 dates meals with toISOString() (UTC), line 209. That causes D5 (1:30 a.m. 1 Oct Karachi filed under September).
  Design in docs/PLAN.md section 3: each change is an event with ID, local date + time zone, UTC timestamp and its movements; balances are derived; undo is a reversing event.
  Recipe versions: a cooking event must keep the recipe version it used (F63, F77).
  Feature rows: F25, F26, F43, F59, F74 in docs/FEATURES.md.
definition-of-done: Schema version field and a migration hook exist
tags:
  - p0
blocked-by:
  - 01M43TETHASF81N3J8MVKYCYWB
related: []
commits: []
created-at: 2026-10-04T16:02:54Z
updated-at: 2026-10-06T18:09:47Z
updated-by: Aly Jafferani
outcome-what: "Event ledger, quantities and household-local dates"
outcome-why: P0 ledger delivered
outcome-resolves: DoD 5/5
assignee: Aly Jafferani
---

# P0: event ledger, quantities and local dates

## Definition of Done

- [x] Schema version field and a migration hook exist
  proof: app/src/domain/types.ts:316 SCHEMA_VERSION; app/src/storage/db.ts DB_LAYOUT_VERSION + upgrade
- [x] Types and module for events, movements and balances, with unit tests
  proof: app/src/domain/ledger.ts + app/src/domain/ledger.test.ts
- [x] Test: reversing a cooking event restores stock AND removes it from history and monthly stats (D3)
  proof: app/src/domain/history.test.ts (reversal removes the cook from history and monthly stats, D3)
- [x] Test: purchase then undo leaves no 'in pantry' state at zero stock (D4)
  proof: app/src/domain/ledger.test.ts / pantryActions.test.ts (purchase then undo, no in-pantry at zero, D4)
- [x] Test: event at 01:30 on 1 Oct Asia/Karachi groups under October (D5)
  proof: app/src/lib/localDate.test.ts / history.test.ts (Karachi-midnight grouping, D5)

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

