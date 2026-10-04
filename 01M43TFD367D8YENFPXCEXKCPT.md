---
id: 01M43TFD367D8YENFPXCEXKCPT
title: "P1: cook from stock, cooking history, a recipe for every dish"
status: backlog
ready: false
creator: Aly Jafferani
goal: Noor can replace v3 with the new app for everyday cooking.
context: |-
  v3 (sources/Noor_Kitchen_App_v3.html) works for Noor today but has six reproduced defects D1-D6 (docs/PLAN.md section 4).
  Scope: the 45 P1 rows in docs/FEATURES.md - pantry with direct amounts and units, recipes with search/filters/scaling, Today suggestions, cook with date/slot/servings and confirm-usage, everyday use and finished items, low stock, monthly stats, personal recipes, backup.
  D1: v3 re-renders the search box on each key and focuses the removed node (lines 213, 239). Search must keep focus.
  Ranking meaning depends on D-07.
  Split into smaller tickets in pre-process before implementing.
definition-of-done: "Installed and opened on Noor's actual phone (record which phone)"
tags:
  - p1
blocked-by:
  - 01M43TEV902MGP88SF35823HWF
  - 01M43TEVFCH8S69JHNZFKR4RJP
related: []
commits: []
created-at: 2026-10-04T16:03:13Z
updated-at: 2026-10-04T17:19:52Z
updated-by: Aly Jafferani
---

# P1: cook from what we have (v3 parity without D1-D6)

## Definition of Done

- [ ] Installed and opened on Noor's actual phone (record which phone)
- [ ] Every P1 row in docs/FEATURES.md is implemented or explicitly deferred with Aly's agreement
- [ ] Regression test per defect D1-D6, each shown to fail against v3 behaviour
- [ ] Every dish opens a recipe: the saved link, or one found on the internet with its source shown (F78)
- [ ] Cooking history report: how often each dish is cooked per week and month, last cooked, not cooked for a while (F79)

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

