---
id: 01M43TEV1ABBQ0T3RHJVE4434X
title: "P0: units, conversions and quantity parser"
status: backlog
ready: false
creator: Aly Jafferani
goal: "Quantities are always read with their unit, validated, and converted only where safe."
context: |-
  v3 parses pasted quantities with parseFloat on the number only (sources/Noor_Kitchen_App_v3.html line 143).
  Result: 'Chicken — 500 g' stored as 500 kg, and a negative amount read as positive (D2).
  Rule from Codex's review (F58): g/kg and ml/L convert automatically; pao and dozen need a configured rule; packets need a size; cups need an ingredient-specific conversion.
  Unknown amount is not zero (F59). Household aliases and local unit names: F69.
definition-of-done: "Quantity type has basis measured | estimate | unknown, with tests"
tags:
  - p0
blocked-by:
  - 01M43TETHASF81N3J8MVKYCYWB
related: []
commits: []
created-at: 2026-10-04T16:02:55Z
updated-at: 2026-10-06T18:11:14Z
updated-by: Aly Jafferani
---

# P0: units, conversions and quantity parser

## Definition of Done

- [x] Quantity type has basis measured | estimate | unknown, with tests
  proof: app/src/domain/types.ts QuantityBasis (measured|estimate|unknown); app/src/domain/units.test.ts
- [ ] Parser test: '500 g' is 500 g, '1.5 kg' is 1500 g, '-2' is rejected with a message
- [ ] Conversion refuses cups or packets without a rule instead of guessing

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

