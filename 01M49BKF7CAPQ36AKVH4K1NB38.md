---
id: 01M49BKF7CAPQ36AKVH4K1NB38
title: "Command Code provider for photo reading (deepseek-v4-flash-vision-exp), key on phone"
status: signoff
ready: true
creator: Aly Jafferani
assignee: Aly Jafferani
goal: "Snap pantry can read a photo through Aly's Command Code gateway (OpenAI chat/completions) with a phone-stored key and a chosen vision model, with Gemini kept available as an option."
context: "Gemini photo reading kept timing out on a real phone (4 attempts, 'Gemini is taking too long to scan', 2026-10-06). Aly decided to add Command Code (his LLM gateway, https://api.commandcode.ai) as a provider for the photo reading. Model: deepseek/deepseek-v4-flash-vision-exp (a vision model in Aly's Command Code catalog). Key stored on the phone only (same rule as D-08). Command Code speaks OpenAI chat/completions for non-Claude models and has no Google-grounded search, so this covers the photo reading (groceries/receipt/pantry) and the typed list; the add-dish live web lookup stays on Gemini for now."
definition-of-done: "Command Code client implements the GeminiClient interface over OpenAI chat/completions; Settings offers provider (Gemini | Command Code), the Command Code key and the model; photo reading works with mocked Command Code responses; the key is never exported in a backup; new settings fields round-trip; typecheck, logic and browser suites pass."
tags:
  - p2
blocked-by: []
related: []
commits: []
created-at: 2026-10-06T19:38:44Z
updated-at: 2026-10-07T11:52:47Z
updated-by: Aly Jafferani
review-summary: "GLM 5.3 review (audit/glm-2026-10-06-commandcode.md): READY. The Command Code provider is correctly isolated, the key never leaves the phone or a backup, add-dish stays on Gemini, and an existing Gemini-only user's default is unchanged. typecheck clean; npm test 745/745; npm run test:e2e 113/113."
review-gaps: "One commit-hygiene item fixed in this change (progress-bar CSS was uncommitted). Four low hardening notes: message-less envelope resolved as success (fixed), whitespace key inconsistency (fixed), rate bucket resets on provider switch (accepted), truncated JSON is retryable (accepted). Live key and real-phone timing unverified."
review-verdict: READY
review-check: "typecheck clean; npm test 745/745; npm run test:e2e 113/113. Not verified: a real Command Code key and the live deepseek model."
outcome-resolves: Command Code photo provider (deepseek vision) added; key on phone; GLM 5.3 READY; merged to main and deployed
---

# Command Code provider for photo reading (deepseek-v4-flash-vision-exp), key on phone

## Definition of Done

- [x] Command Code client implements the GeminiClient interface over OpenAI chat/completions; Settings offers provider (Gemini | Command Code), the Command Code key and the model; photo reading works with mocked Command Code responses; the key is never exported in a backup; new settings fields round-trip; typecheck, logic and browser suites pass.
  proof: Command Code client (app/src/commandcode/client.ts) implements GeminiClient over OpenAI chat/completions with the same limits/error taxonomy; Settings provider picker + Command Code key/model (photo provider defaults to whichever key exists); dish lookup stays Gemini; backup keeps provider+model, strips the key. Tests: client unit, backup round-trip, e2e snap via Command Code. typecheck clean; npm test 745/745; npm run test:e2e 113/113.

## Options

- [ ] brainstorm
- [ ] planning

## Plan

<Steps, in order — filled in by the pre-process step, or by you.>

## Progress

