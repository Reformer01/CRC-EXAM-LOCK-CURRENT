# Pilot Results — Lockout & System-Notification Flows

**Module:** USABILITY-TEST-LOCKOUT-SYSFLOW.md · **Date:** pilot run on v1.1.9

## Resolution status (updated after the v1.1.12 fix pass)

| Finding | Status |
|---------|--------|
| **R-A** popup locked/submitted states unreachable | **FIXED (v1.1.12)** — background now keeps a `lastFinal` record (`SESSION_FINAL` on lock/submit; derived from `END_SESSION` reason as a fallback), `EXAM_INACTIVE` no longer erases it, and the popup renders "Exam locked" / "Exam submitted" from it with details and guidance. Covered by the promoted plain checks in `tests/suites/lockout-popup.js`. |
| **R-F** no auto-unlock after mid-exam violation lockout | **FIXED (v1.1.12)** — `startUnlockPolling()` now runs on the 4th-violation lockout path, so an invigilator unlock is adopted within one poll interval without reloading. Covered by the promoted plain check. |
| **R-C** announcement cascade at lockout | **FIXED (v1.1.13)** — the "Session finalized…" status toast is no longer shown on the locked ends (max-violations and time-expired), so the lockout announces at most twice: the violation alert and the overlay. Covered by the promoted plain check (≤ 2 announcements within 500 ms). |
| **R-D** co-occurring toasts fully overlap | **FIXED (v1.1.13)** — toasts are stacked under the top-right corner with measured per-toast offsets (`relayoutToasts()` in content.js); neighbours slide up when one dismisses or its "Return to Full Screen" button is used. Covered by a plain check asserting distinct `top` offsets for live co-occurring toasts. |
| **R-E** popup vs badge wording | **FIXED (v1.1.15)** — the popup now renders the violations row as "N of 4 — the 4th locks your exam" (matching the badge), and the lockout overlay's "Violations" line was the last `/ 4` fraction straggler — now "N of 4" everywhere (badge, toasts, badge live region, lockout overlay, popup). The backend report email shows a raw record total ("Total Violations: N"), which is a log count rather than a threshold position and never used a fraction. Covered by the promoted plain check + a no-fraction invariant across `content.js` and `popup.js`. |
| R-B 4th-violation toast behind overlay | **BENIGN / watch** — the overlay itself carries the needed information. |
**Method caveat (read first):** this is an **automated dry-run**, not a human usability
test. It drove the real v1.1.9 `content.js` and `popup.js` through five scripted
participant personas and checked the protocol's observable conditions programmatically.
It validates that the flows and instruments behave as the module expects and surfaces
code-level defects for the human run to confirm. **Human comprehension, affect, and SUS
still require the 5–8 real sessions in the module.** Metrics below are code checks, not
participant data.

## Roll-up

Checks: **25** · Pass: **20** · Fail: **5** (all five are genuine product findings, not
harness artifacts — each was traced to code)

| Persona | Profile exercised | Result |
|---------|-------------------|--------|
| P1 Nadia | system interruption → 4 violations → lockout → recovery → submit | 8 pass / 4 fail (finds R-A, R-F) |
| P2 Marcus | held-key repeat guard; double interruption (throttle) | 4/4 pass |
| P3 Priya | screen reader: announcement sequence at lockout | 1 pass / 1 fail (R-C) |
| P4 Tom | info + violation toasts co-occur; popup in progress | 3 pass / 1 fail (R-E; R-D observed) |
| P5 Ana | interruption then clean submit | 3/3 pass |

## Risk register: confirmed / refuted

| # | Risk | Verdict | Evidence from pilot |
|---|------|---------|---------------------|
| R-A | Popup locked + submitted states unreachable | **CONFIRMED (P1)** | Lockout and submit both call `teardown()` → `EXAM_INACTIVE` → background clears its active session **before** `END_SESSION`. Popup at lockout and after submit rendered **"No active exam session."** — the popup's "Exam locked / Contact your invigilator" and "Exam submitted" branches never render in this flow. The toolbar badge also drops at lockout. |
| R-B | 4th-violation toast instantly covered by overlay | **CONFIRMED (code order)** | Overlay (z 2147483647) is appended after the 4th-violation toast (z 2147483646) in `recordViolation`. Human sessions should verify whether the overlay itself carries the needed information (it does) — likely benign, watch for the duplicate "Session finalized" info toast that also lands behind the overlay. |
| R-C | Screen-reader announcement cascade at lockout | **CONFIRMED (P2, SR)** | 3 announcements within 500 ms of lockout: Violation-4 alert + "Session finalized…" status + overlay alert. Suggest suppressing the "Session finalized" info toast when a lockout overlay is present (that copy belongs to non-locked ends). |
| R-D | Co-occurring toasts fully overlap (same `top:80 right:18`) | **OBSERVED (P2)** | Info + warning toasts were alive simultaneously, sharing identical CSS placement; newest fully covers oldest. Needs a human check on how often this co-occurrence is actually noticed; likely fix is stacking or queuing. |
| R-E | Popup "N / 4" vs badge "N of 4 — the 4th locks your exam" | **CONFIRMED (P3)** | popup.js renders `1 / 4`; in-exam badge renders `1 of 4 — the 4th locks your exam`. Same count, two formats, two seconds apart. |
| R-F | No auto-unlock after mid-exam violation lockout | **CONFIRMED (P1)** | `startUnlockPolling()` runs on boot-into-lock and reconcile-discovered lock only — **not** on the primary 4th-violation lockout path. With the admin unlock applied server-side, the lockout overlay stayed up past a full poll interval; the session resumed only after a simulated reload (reload → init → polling → unlock adopted within 5 s). Impact: a locked student who is unlocked by the invigilator stays locked until they refresh the page, and a refresh discards the in-progress form view. |

## What the pilot validated as working (for the human run to confirm user-side)

- System interruption → single "NOT counted" info toast, `role="status"`, **violation
  count unchanged** (P1, P5), throttled correctly on repeat interruptions (P2).
- Real violations → toast + badge move to "N of 4" (P2, P4); held-key repeats never
  count (12 repeats → 0) and one real press counts exactly once (P2).
- Lockout overlay: `role="alert"`, focus moves to the heading, timer removed, reason and
  contact-help text present (P1).
- Recovery path that exists today: reload → lockout + polling → admin unlock adopted →
  count reset to 0 → clean submit with "no violations on record" toast (P1, P5).
- Clean-exam submit toast and popup idle text after finalization (P5).

## Recommended fixes (ordered; none applied — this was a validation pass)

1. **P1 — R-F:** call `startUnlockPolling()` on the violation-lockout branch of
   `recordViolation` so an invigilator unlock is adopted without a reload.
2. **P1 — R-A:** stop clearing the background session on `EXAM_INACTIVE` when the tab is
   still alive and locked/submitted (or have the popup fall back to the tab's content
   state), so the popup's locked/submitted states render.
3. **P2 — R-C:** skip the "Session finalized…" toast when a lockout overlay is present. ✅ done (v1.1.13)
4. **P2 — R-D:** give toasts distinct stacking offsets (or queue) so co-occurring
   messages are both visible. ✅ done (v1.1.13)
5. **P3 — R-E:** render the popup violation count in the same "N of 4 — the 4th locks
   your exam" format as the badge. ✅ done (v1.1.15) — **all five findings are closed.**

## What the real 5–8 participant run must still answer

- RQ2/RQ3 (affect at first violation; belief that system alerts are not counted) — the
  pilot can only verify the *system* did not count them.
- RQ5/RQ9: whether a student who hits R-F would try reloading, call the invigilator, or
  abandon — and whether the popup's "No active exam session." at lockout causes doubt.
- RQ10: whether the R-C/R-D overlaps are actually noticed by humans.
- SUS and trust-in-submission scores per the module.
