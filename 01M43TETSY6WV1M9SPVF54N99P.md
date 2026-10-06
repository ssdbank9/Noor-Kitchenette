---
id: 01M43TETSY6WV1M9SPVF54N99P
title: "P0: event ledger, quantities and local dates"
status: backlog
ready: false
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
updated-at: 2026-10-06T18:09:14Z
updated-by: Aly Jafferani
---

# P0: event ledger, quantities and local dates

## Definition of Done

- [x] Schema version field and a migration hook exist
  proof: app/src/domain/types.ts:316 SCHEMA_VERSION; app/src/storage/db.ts DB_LAYOUT_VERSION + upgrade
- [ ] Types and module for events, movements and balances, with unit tests
- [ ] Test: reversing a cooking event restores stock AND removes it from history and monthly stats (D3)
- [ ] Test: purchase then undo leaves no 'in pantry' state at zero stock (D4)
- [ ] Test: event at 01:30 on 1 Oct Asia/Karachi groups under October (D5)

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

