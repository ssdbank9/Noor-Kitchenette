# Adversarial review — Command Code photo provider (K1NB38, D-24)

Reviewer: GLM 5.3, independent adversarial pass. Read-only; no source, test, doc or ticket file was
modified. Scratch probes were run from the system temp dir against the committed client.

## Snapshot

- Branch `claude/review-fixes`, commit `4c41740` ("feat(K1NB38): Command Code photo provider
  (deepseek vision), key on the phone"), ticket `01M49BKF7CAPQ36AKVH4K1NB38` (status: review),
  decision D-24 in `docs/DECISIONS.md`.
- Files reviewed in full: `app/src/commandcode/client.ts` (+ its test), `app/src/gemini/GeminiContext.tsx`,
  `app/src/ui/SettingsScreen.tsx`, `app/src/ui/AddDishScreen.tsx`, `app/src/ui/SnapPantry.tsx`,
  `app/src/domain/types.ts`, `app/src/storage/backup.ts` (+ its test), `app/src/App.tsx`,
  `app/tests/e2e/snap.spec.ts`, `docs/DECISIONS.md`, the ticket, and the pre-commit
  `GeminiContext.tsx` for comparison. `app/src/gemini/client.ts` and `photo.ts` read as the
  reference for parity.

## Actual counts (run from `app/`)

- `npm run typecheck` — clean, no errors.
- `npm test` — **745 passed / 745** (50 files). Matches the commit message.
- `npm run test:e2e` — **113 passed / 113** (1.3m), including the new
  `snap.spec.ts:244` Command Code test. Matches the commit message.
- Extra scratch probes (temp dir, not the repo): 15 hand-written adversarial cases against the
  committed client; 14 confirmed the expected behaviour, 1 exposed a defect (F2 below).

## Per-area verdicts

| Area | Verdict |
|---|---|
| Request mapping (system role, text parts, `image_url` data URLs, `response_format: json_object`, extra "JSON only" text part) | **Pass** — verified by the unit test and by my probe (correct message array, Bearer header, default model, key never in the URL). |
| Envelope parsing (`choices[0].message.content` as string AND part arrays, fence stripping) | **Pass with one hole** — string and array content both handled; lazy-fence regex handles plain and fenced JSON; a truncated fence degrades to a controlled `bad-response`. But see F2. |
| Error mapping (no-key, 401/403, 429+retry, 5xx+retry, offline, timeout-through-body, too-large) | **Pass** — all reproduced by probes; `too-large` fires before any call and before consuming a rate slot; timeout stays live through the body read (probe: stalled `res.json()` → `timeout`); `retry-after` seconds honoured, garbage ignored; 429-twice → `rate-limit`. |
| `search` refused without a network call | **Pass** — thrown before the size check, the rate slot and `fetch`; probe confirms zero calls. |
| Provider default logic | **Pass with a latent inconsistency** — an existing Gemini-only user keeps Gemini; both keys → Command Code per D-24. But the two default expressions differ (F3). |
| Key lifecycle (refs, no remount, per-provider rate buckets) | **Pass with a caveat** — saving/removing a key takes effect immediately through the refs; buckets are per client, not shared. But the memo deps reset a bucket (F4). |
| Backup (key never exported, restore preserves it, provider+model round-trip) | **Pass** — `withoutSecrets` strips `commandCodeKey` by name; restore keeps the phone's CC and Gemini keys; a hand-edited backup carrying `settings.commandCodeKey` is *rejected* as an unknown field (`Checker.record`), so a key cannot be smuggled in. |
| Add-dish stays on Gemini | **Pass** — `dishClient` + `hasGeminiKey`; the no-key message correctly says "Gemini key"; `searchDishes` cannot reach the Command Code client. |
| Secrets | **Pass** — only fake keys in tests; key goes in the `Authorization` header only; nothing key-like found in the tree. |

## New findings

**F1 (Medium — commit completeness): the `ReadingProgress` styles are not in the commit.**
`app/src/ui/SnapPantry.tsx` (added in 4c41740) renders `.snapprogress`, `.snapprogress__track`,
`.snapprogress__bar`, `.snapprogress__num`, but the CSS for them exists only as an **uncommitted
working-tree change** to `app/src/styles.css` (`git status` shows ` M app/src/styles.css`).
Failing input: a fresh checkout / CI build of 4c41740 — the progress bar renders unstyled (raw
div + number, no track). It works on the owner's phone only because his tree is dirty.
Suggested fix: commit the `styles.css` hunk (owner action — I did not touch it).

**F2 (Low — new code copies an existing hole): a malformed envelope is accepted as success.**
`app/src/commandcode/client.ts:130-144`. Failing input: response body
`{"choices":[{"finish_reason":"stop"}]}` (no `message`) or `content: null` with
`finish_reason: "stop"`. `message` is `undefined`, text becomes `''`, and the guard
`choice === undefined || (!text && finishReason !== 'stop')` does not fire, so `generate`
resolves with `{ text: '' }`. For JSON calls (the photo flow) this safely degrades to
`bad-response` via the `JSON.parse('')` failure, but for the non-JSON call — exactly
`testKey` in Settings — "Test my key" reports **"Key works" on a broken envelope**. The Gemini
client has the same hole (`finishReason === 'STOP'` with no parts), so this is parity rather
than a regression, but the new client had the chance to require `message`/non-empty content.
Suggested fix: throw `badEnvelope()` when `message` is missing or when text is empty and the
call was not JSON-mode.

**F3 (Low — inconsistent default expressions): SettingsScreen omits `.trim()`.**
`app/src/ui/SettingsScreen.tsx:72` uses `p.settings.commandCodeKey ? 'commandcode' : 'gemini'`
while `app/src/gemini/GeminiContext.tsx:35` uses `p.commandCodeKey?.trim() ? ...`, and
`hasCcKey = Boolean(p.settings.commandCodeKey)` (line 73) is also untrimmed. Failing input: a
whitespace-only `commandCodeKey` (not reachable through the UI, which trims on save, nor
through backups, which never carry it — reachable only by tampering with IndexedDB or the
localStorage mirror): Settings shows the Command Code panel, "A key is saved", and enabled
Remove/Test buttons, while the app routes photos to Gemini and SnapPantry says "needs your
Gemini key". Latent, but the two expressions should not disagree.
Suggested fix: `p.settings.commandCodeKey?.trim()` in both places.

**F4 (Low — the per-minute cap can be reset from the UI): client memo recreated on model change.**
`app/src/gemini/GeminiContext.tsx:40-44` — `useMemo(..., [provider, p.commandCodeModel])` builds
a fresh client (fresh `recent[]` bucket, `client.ts:41`) whenever the provider is toggled or the
model re-saved, so the 12/min self-protection cap restarts; a `commandCodeModel` change while the
provider is Gemini also needlessly recreates the Gemini client. The old comment's invariant
("created once so its per-minute limit holds across screens") no longer fully holds. Low impact
(it is Aly's own key/gateway), but it is a weakening the commit message does not mention.
Suggested fix: read the model through a ref (like the keys) and key the memo on `provider` only,
or hoist the bucket out of the client.

**F5 (Low / design note): `finish_reason: 'length'` output is returned or retried, not flagged.**
`app/src/commandcode/client.ts:143-150`. Probe: truncated JSON with `finish_reason: 'length'` →
`bad-response` with `retryable = true`, so the UI offers "Try again" for a deterministic
truncation (retrying cannot help); truncated non-JSON text is returned silently (exact parity
with the Gemini client). No data corruption is possible — the photo flow validates the draft
either way. Suggested fix: map `finish_reason === 'length'` to a non-retryable "the answer was
too long" error.

## Suggestions (not defects)

- Removing the Command Code key while the provider was *defaulting* to Command Code makes the
  whole CC panel (key field, model field, test button) vanish mid-interaction; the typed-but-
  unsaved key text survives in state but is hidden until the user re-picks Command Code. Consider
  clearing `ccKeyText` on remove, or keeping the panel visible.
- Adding a Command Code key silently flips photo reading to Command Code for an existing Gemini
  user (no explicit picker touch). D-24 documents it and the picker shows it, but nothing
  announces the switch.
- The e2e test only covers the explicit-picker path; the key-only default path and
  `GeminiContext` itself have no browser/unit test. The CC client also has no unit test for the
  timeout-through-body path (I verified it with a scratch probe).
- `ReadingProgress` (SnapPantry) is scope beyond K1NB38's definition of done, has no unit test,
  and updates `aria-valuenow` every 120 ms, which some screen readers may announce repeatedly.
  It is a fabricated estimate — the docstring says so honestly, and it never claims 100%.
- A gateway 400 carrying a key-ish message maps to `bad-response`, not `bad-key` (the Gemini
  client special-cases this). If the gateway ever reports a bad key as 400, the message will be
  less precise.

## Not verified

- A real Command Code key and the live `deepseek/deepseek-v4-flash-vision-exp` model: no key
  exists here (none in the tree — only fakes), so the actual gateway behaviour, its real status
  codes, vision quality, and whether 45 s is enough on Noor's phone (the reason this feature
  exists) are unverifiable in this environment.
- Whether the gateway accepts `response_format: json_object` for this model, and what a
  non-vision model typed into the model field actually returns (it would surface as a mapped
  `bad-response`/`server` error at worst).
- The uncommitted `styles.css` rendering on a fresh checkout (reasoned from the diff, not built).
- Real-device behaviour (the repo's phone findings tickets) — desktop Playwright only.

## Verdict

**READY** — the provider is correctly isolated, the key never leaves the phone or a backup,
all 745 unit and 113 e2e tests pass, and the only medium finding (F1, uncommitted CSS for the
new progress bar) is a commit-hygiene fix plus four low-severity hardening items that do not
block Noor using it.
