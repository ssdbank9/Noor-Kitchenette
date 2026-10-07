---
id: 01M4B4VHCXMC9TEWSD05T7JSD8
title: "Easy item entry in Typed list (Enter per item, item + quantity units) and clearer unmatched-item wording"
status: backlog
ready: true
creator: Aly Jafferani
assignee: Aly Jafferani
goal: "Typing a grocery list is forgiving: one item per Enter with clear parse-OK feedback and the accepted units visible; a photo-read line that is not one of your items says plainly what to do."
context: "Real-phone test (2026-10-06): typing 'chicken and milk' produced a confusing parse and Aly asked what 'Pick which of yours this is' means. The typed phase is one big textarea (no per-item confirm); the unmatched-line button (PhotoReview.tsx) is unclear. Make entry per-Enter with a live parsed preview, and reword the button to say the item is not one of yours."
definition-of-done: "Typed entry adds an item per Enter (and splits pasted lines), each showing its parsed name and amount plus a remove; the format hint lists kg/g, L/ml, pc, dozen, packet, bunch, tsp/tbsp/cup/pao, plain number; the unmatched-line button is reworded plainly; the two snap typed-list e2e tests pass on the new flow; typecheck, logic, browser suites pass."
tags:
  - p2
blocked-by: []
related: []
commits: []
created-at: 2026-10-07T12:19:18Z
updated-at: 2026-10-07T12:19:18Z
---

# Easy item entry in Typed list (Enter per item, item + quantity units) and clearer unmatched-item wording

## Definition of Done

- [ ] Typed entry adds an item per Enter (and splits pasted lines), each showing its parsed name and amount plus a remove; the format hint lists kg/g, L/ml, pc, dozen, packet, bunch, tsp/tbsp/cup/pao, plain number; the unmatched-line button is reworded plainly; the two snap typed-list e2e tests pass on the new flow; typecheck, logic, browser suites pass.

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

