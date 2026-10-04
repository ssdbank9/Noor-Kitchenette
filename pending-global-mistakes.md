# Pending global mistakes log update

Canonical destination: `C:\Users\Aly Jafferani\.codex\mistakes.md`.
The destination is outside this task's writable roots. This workspace entry is staged for a future authorized synchronization; the canonical log has not been changed.

## GLOBAL-20260905-03 recurrence - Noor's Kitchen brainstorm, 2026-10-04

- Date / project: 2026-10-04; Noor's Kitchen product brainstorm.
- Category / status: Inspection workflow error; recovered for source review; global synchronization pending.
- Evidence / impact: Two combined tool results warned of output truncation (16,867 and 10,303 original tokens). Relevant tool and source details could have been obscured. No application code or supplied HTML was changed.
- Cause: Combining independent source reads, a long skill read, tool metadata, and broad web results exceeded the useful output budget. This repeated an existing prevention lesson.
- Correction / prevention: Re-read the canonical truncation lesson before further retrieval. Read all substantive HTML sections in bounded line ranges and retrieve official architecture documentation in focused calls. Keep web searches short and avoid combining lengthy documentation with source dumps. No visualization was authored, so the partially returned visualization skill was not applied.
- Verification / recurrence: HTML lines 131-398 containing the personas, requirements, photo pantry workflow, product directions, architecture, v1 scope, open questions, and glossary were inspected across focused reads. Official PWA, backend authorization, and image-understanding pages were retrieved separately. This records the two output-truncation occurrences on 2026-10-04; it is not a claim of application or browser testing.

## NOOR-20261004-REVIEW-TOOLS - Source review tooling limitations and corrections

- Date / project: 2026-10-04; review of the earlier kitchen workbooks and HTML app.
- Category / status: Inspection workflow errors and environmental limitations; source extraction and isolated browser verification recovered; global synchronization pending.
- Evidence / impact: Long spreadsheet-skill, HTML-search, and workbook-comparison outputs were truncated. The first Python inspector stopped on a Windows cp1252 UnicodeEncodeError while printing a checkbox. Openpyxl warned that an extended dropdown representation is unsupported. The default Playwright headless executable was absent; browser cache directory enumeration was denied. A command also checked an incorrect browser cache location under .cache.
- Cause: Insufficient output bounds; omitted explicit UTF-8 stdout; parser coverage limits; guessed/default browser locations that were not verified.
- Correction / prevention: Re-read truncated skill and source sections in bounded ranges. Persist full extraction and comparison evidence locally and print targeted summaries. Set Python stdout to UTF-8. Read dropdown extensions directly from XLSX XML and never save source workbooks through the parser. Use the verified installed Chrome executable for isolated headless checks without accessing the denied cache directory. Compare spreadsheet hyperlink targets rather than displayed link labels; a preliminary comparison falsely classified all recipe URLs as mismatches before this was corrected.
- Verification / recurrence: Both complete workbook extractions succeeded; raw XML dropdown records were retained. All 22 recipes, 62 ingredients, 276 recipe-ingredient rows, relevant metadata and hyperlink targets reconcile. Ten isolated browser checks completed without verification errors. The coverage report's 77-row count, search, filters, reset and 390-pixel width passed. All three source SHA256 hashes were unchanged. Output truncation also recurred during workbook comparison and a short handoff read; source detail was retained in audit files and relevant rules had already been read fully. Global synchronization remains pending.

## NOOR-20261004-LEGACY-DEFECTS - Verified defects in the supplied HTML v3

- Date / project: 2026-10-04; Noor_Kitchen_App_v3.html review.
- Category / status: Confirmed pre-existing defects; open. No app fixes were authorized or applied during this comparison.
- Evidence / impact: Isolated Chrome checks reproduced six issues: recipe/pantry search loses focus after the first character; pasted weights ignore units (a synthetic 500 g entry becomes 500 kg) and a negative amount is read as positive; cooking undo restores stock but retains the meal/statistics; purchase undo temporarily retains an in-pantry marker after restoring zero stock; a Karachi 1 October meal is recorded with a September UTC date; a simulated storage quota failure hides the failed save and the changed quantity is lost on reload.
- Cause: Replaced search inputs are focused through a detached node; the parser reads only a number and ingredient name; snapshots store only pantry balances; temporary purchase markers are not included in reversal; UTC dates are used for local monthly grouping; save exceptions are swallowed.
- Correction / prevention: Keep input focus stable. Validate and convert quantity plus unit before review. Link stock and history changes to an event and reverse them together. Store household local date separately from ordering timestamps. Show and retain failed saves. Keep unknown amounts distinct from measurements.
- Verification: audit/browser-evidence.json records the six reproductions and positive manual-edit and valid-backup/restore behavior. Tests used disposable data at 390 × 844 pixels and Asia/Karachi timezone. The source app's hash is unchanged. Simulated storage failure is not evidence of past loss of real user data. The broader feature review is retained in Noor_Kitchen_Coverage_Review.html.

## NOOR-20261004-WORKFLOW-COVERAGE - Earlier brief workflow omitted legacy feature detail

- Date / project: 2026-10-04; kitchen workflow comparison after the user supplied two earlier workbooks and an HTML app.
- Category / status: Confirmed scope gaps in the earlier short workflow; expanded proposal documented; app implementation remains outstanding.
- Evidence / impact: New source review identified legacy features omitted from the brief workflow, including ranked cookability, recipe/video links, times and notes, stock thresholds, update metadata, cooking dates and meal types, store grouping, monthly history and backup detail. The source Excel shopping total is catalog-wide, not a selected weekly plan. Integrated image recognition and a weekly plan are missing from the legacy app.
- Cause: The short explanation described the basic meal/pantry cycle before these legacy files were supplied; it was not a complete specification or a review of those files.
- Correction / prevention: Build the fuller specification from the union of source capabilities and confirmed new user requirements. Preserve source traceability and distinguish proposals from agreed scope. Keep daily recommendations alongside planning, and calculate shopping from selected meals rather than the complete recipe catalog.
- Verification: The retained matrix contains 38 Excel-derived capabilities, 12 additional legacy HTML capabilities, 3 confirmed current requirements, 10 proposed-workflow capabilities, and 14 thorough-app proposals. Each has separate prior-workflow and legacy-app status. Physical phone acceptance, native Excel recalculation, external link validity, sharing delivery and cloud/multi-user behavior remain unverified.
