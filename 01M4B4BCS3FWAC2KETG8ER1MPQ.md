---
id: 01M4B4BCS3FWAC2KETG8ER1MPQ
title: Show active photo provider/model and surface scan notes
status: backlog
ready: true
creator: Aly Jafferani
assignee: Aly Jafferani
goal: "Noor (and Aly) can always see which photo-reading model is in use, and when a photo reads nothing the app says why (the model's own note), so a model swap is guided."
context: "Real-phone test with the Command Code provider (deepseek/deepseek-v4-flash-vision-exp): a photo came back with zero items and the app showed a generic message, discarding the model's  (app/src/ui/SnapPantry.tsx:178). Two gaps: the active provider/model is not shown anywhere in the app, and the model's explanation is hidden. The likely live cause (unverified) is that this particular deepseek vision model is not receiving/reading the image well; surfacing the note reveals that."
definition-of-done: "The Snap pantry screen shows the active provider and model id; the empty-read error shows the model's note when present; tests updated where needed; typecheck, logic and browser suites pass."
tags:
  - p2
blocked-by: []
related: []
commits: []
created-at: 2026-10-07T12:10:29Z
updated-at: 2026-10-07T12:10:29Z
---

# Show active photo provider/model and surface scan notes

## Definition of Done

- [ ] The Snap pantry screen shows the active provider and model id; the empty-read error shows the model's note when present; tests updated where needed; typecheck, logic and browser suites pass.

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

