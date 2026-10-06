---
id: 01M49A7P25FD6WS8Q78VNDB36P
title: Fix phone photo OOM and lost Snap reading on background/reload
status: backlog
ready: true
creator: Aly Jafferani
assignee: Aly Jafferani
goal: "Snap pantry survives a real phone: a large photo must not exhaust memory, and an in-progress reading must not vanish when the browser reloads the page (background/return)."
context: |-
  Found on a real phone 2026-10-06 during internal acceptance (P2MYBJ).
  Defect 1 (photo OOM): taking a photo in Snap pantry showed 'unable to complete previous options due to low memory'. app/src/gemini/photo.ts prepareImage calls createImageBitmap(file), which decodes the FULL-resolution camera image before shrinking to 1280 px; a large phone photo can exhaust the browser's memory.
  Defect 2 (lost draft): after alt-tabbing to another app and back, the Snap screen and what Gemini had read were gone. The draft lives only in SnapPantry React state (app/src/ui/SnapPantry.tsx); when the browser discards and reloads the page under memory pressure, the validated PhotoDraft is lost. Photos are deliberately not stored, but the text reading can and should survive.
  Fix direction: decode the photo downscaled; persist the draft (text only, never the photo) and reopen Snap on load if a saved draft exists; clear it on save or discard.
definition-of-done: "prepareImage asks the browser to decode downscaled and falls back safely; a saved PhotoDraft survives a reload and Snap reopens on it; the draft is cleared on save or discard; unit/e2e regression tests; typecheck, logic and browser suites pass."
tags:
  - p2
blocked-by: []
related: []
commits: []
created-at: 2026-10-06T19:14:50Z
updated-at: 2026-10-06T19:22:02Z
updated-by: Aly Jafferani
---

# Fix phone photo OOM and lost Snap reading on background/reload

## Definition of Done

- [ ] prepareImage asks the browser to decode downscaled and falls back safely; a saved PhotoDraft survives a reload and Snap reopens on it; the draft is cleared on save or discard; unit/e2e regression tests; typecheck, logic and browser suites pass.

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress
- **2026-10-06 19:22 · Aly Jafferani** — Fixed on branch claude/review-fixes. decodePhoto asks the browser to decode downscaled (resizeWidth 1280) with a plain-decode fallback; the validated draft (text only) is kept in localStorage and Snap reopens on it, cleared on save or discard. Tests: decodePhoto unit, snapDraftStore unit, e2e snap reload. The exact low-memory failure has not been re-run on the real phone.
