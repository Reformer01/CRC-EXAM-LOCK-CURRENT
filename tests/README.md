# CRC Exam Lockdown — Automated Regression Suite

Dependency-free regression tests that drive the **real** extension and backend code
(`CRC-EXAM-LOCK/content.js`, `popup.js`, `GoogleSheetsScript.gs`) inside stubbed DOM /
Chrome / SpreadsheetApp environments. No browser, no network, no external packages —
only Node.js.

## Run

```bash
node tests/run.js            # everything
node tests/run.js submission # only suites whose filename matches "submission"
```

Exit code `0` = green, `1` = regression. Total run time ~1 minute.

## What is covered

| Suite | Guards |
|-------|--------|
| `submission-hardening.js` | **P0 protections**: a late form confirmation always finalizes (even after lockout); violations are suppressed during submission; a failed submit releases its pending flag (no false "submitted" on tab close); server lock / unlock / Submitted status are authoritative over local state; tampered local state without a server match locks; duplicate sessions resume instead of double-starting; system interruptions are never counted. Backend: first-finalize-wins (a late `tab_closed` never clobbers a `Locked (Violations)` row or re-sends its email). |
| `a11y.js` | WCAG AA contrast math for every shipped text/background pair, template structure (single h1, sr-only labels before inputs, `role=alert` regions, heading hierarchy), toast `role=status`/`alert` runtime behavior, "N of 4 — the 4th locks your exam" badge wording, the badge's polite `role=status` live region (silent on first paint, announces every count change), the subtle Web Audio cue on violation increments (context created on the first user gesture, tone count observable in tests), a no-fraction invariant over every student-facing count render (badge, toasts, lockout overlay, popup all say "N of 4"), CSS hygiene (no orphaned legacy blocks, balanced braces). |
| `duration.js` | Bulk exam-duration change: backend upsert/validation/audit/default endpoints + client pre-selection, mid-exam reconcile adoption with toast, reconcile-on-tab-return. |
| `backend-admin.js` | Admin dialogs are plain language (no raw JSON leaks), destructive actions confirm with exact counts, cancels change nothing, purges delete only real violation rows (audit markers survive), unlock resets rows for re-finalization. |
| `final-minutes.js` | Final-stretch pre-submit checklist (appears once, polite, in the last 3 minutes) and the clean-exam finish-line success toast (semantic green, polite, never shown for flagged exams). |
| `invigilator-queue.js` | Review Queue nudges for admins: the queue is the first tab with locked sessions oldest-first (fill darkens past 10 minutes), then flagged-but-active watch rows, each with a real-clock **Time Left** column (declines while locked, marks "Expired" past the end) so grants can be sized to what a student actually has left, and a **Granted** chip (+N, cumulative from the Extension audit column) so extensions already given are visible at a glance; Submitted/expired/clean sessions never appear; `onOpen` labels the live count on the Review menu and jumps to the queue while anyone is locked; queue-row actions unlock or clear-a-false-positive-and-unlock in one step (plain-language confirms, cancels safe, audit markers kept); the Grant Time submenu nests one-click quick presets (+5/+10/+15/+30 minutes, no prompt or confirm, audited) next to the custom-minutes flow, and presets refuse locked rows with zero mutation; every clear/unlock/grant path refreshes the queue. Also guards the fix that count resets and recomputes write to the `Violation Count` column by header, never the Status column. |
| `grant-time.js` | Mid-exam time grants for invigilators (single session, bulk paste, whole exam by form URL): only Active sessions ever change, locked/submitted/expired rows are skipped, grants accumulate in an `Extension (ms)` audit column, totals cap at the 8 h client maximum, invalid minute values are rejected with nothing written, results are plain-language and audited to DebugLog, and the student client adopts a grant on its next reconcile with the "updated to N minutes" toast. |
| `lockout-popup.js` | End-to-end lockout + system-notification flows through the real popup: NOT-counted info toasts, held-key repeat guard, interruption throttle, lockout overlay announcement + focus, recovery via unlock polling (R-F: polling also starts on the mid-exam violation lockout), popup final states after teardown (R-A: background keeps a `lastFinal` record so "Exam locked" / "Exam submitted" render instead of "No active exam session"), announcement cascade ≤ 2 at lockout (R-C: no finalize toast on locked ends), toast stacking with distinct offsets (R-D), popup violation wording matching the badge (R-E: "N of 4 — the 4th locks your exam"), clean-submit toast. All five pilot findings from `PILOT-LOCKOUT-SYSFLOW-RESULTS.md` are fixed — no xfails remain. |

## How it works

- `tests/helpers/harness.js` provides:
  - a DOM/chrome stub environment that loads the real `content.js` (`createWorld`),
    with a background-session emulation mirroring `background.js` semantics
    (`EXAM_ACTIVE`/`EXAM_INACTIVE`/`END_SESSION`), server fetches driven by an
    in-memory `cfg` object, and an observer that can fire Google's confirmation text;
  - a runner for the real `popup.js` (`runPopup`);
  - a vm sandbox for the real `GoogleSheetsScript.gs` (`createBackendSandbox`);
  - `createCollector()` with `check()` (must pass) and `xcheck()` (known finding).
- Each suite resets its own state; tests never touch the network or the real spreadsheet.

## When to update  - **Any edit to content.js / popup.js / overlay.css / popup.css / GoogleSheetsScript.gs /
  manifest behavior:** run `node tests/run.js` before finishing. Submission and
  hardening regressions fail loudly in `submission-hardening.js`.

## Versioning note

Extension-facing behavior changes (content.js / popup / CSS / manifest) bump
`manifest.json`'s `version`. Backend-only `.gs` changes (admin flows, sheets,
endpoints) ship via the Apps Script redeploy and do not need a manifest bump.
- **Fixing a known finding:** the corresponding `xcheck` in `lockout-popup.js` will
  report `XNOW`; convert it to a plain `check` and delete the marker.
