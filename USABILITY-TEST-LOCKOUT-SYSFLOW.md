# Usability Test Module — Lockout & System-Notification Flows (Popup + Toast Validation)

**Module of:** USABILITY-TEST-PLAN.md (read that first for participant pool, consent,
environment, scoring, and SUS instrument)
**Target build:** extension v1.1.9 · **Participants:** 5–8 (5 valid minimum)
**Duration per session:** ~35 min (module) + master-plan intro/debrief

---

## 1. Why this module

The v1.1.3–v1.1.9 changes made the violation/notification experience more precise and
calmer on paper (toast roles and colors, "NOT counted" system toasts, "N of 4 — the 4th
locks your exam" badge, first-violation coaching, lockout as an announced overlay, popup
state copy). This module tests the two flows those changes touch — **reaching a lockout** and
**surviving a system notification** — and validates that the **toolbar popup** and the
**toasts** tell the truth at every state transition.

### Research questions (extends the master plan)

- RQ2/RQ3 (first-violation affect; system alert believed NOT counted)
- RQ5 (lockout: does the student understand cause + recovery?)
- RQ8 (popup usefulness)
- **RQ9 (new):** Does the popup reflect the session at each state — in progress, locked,
  and submitted?
- **RQ10 (new):** Do toast messages survive visually and in announcement order when
  violations and system interruptions happen close together?

### Surfaces under test

| Surface | State(s) exercised |
|---------|--------------------|
| Violation toasts (warning/error) | 1st–4th violation |
| System-interruption toast ("NOT counted", info) | system fullscreen interruption |
| Violation badge ("N of 4 — the 4th locks your exam") | 0→4 count |
| Lockout overlay (role=alert, heading, help text) | 4th violation |
| Toolbar popup (status dot/text/note, violations, session) | in progress / locked / submitted |
| Reconcile-on-focus + admin unlock | locked → resumed |
| Submission confirmation + finalize toast | normal submit & submit-after-unlock |

---

## 2. Tasks

Environment note: as in the master plan, run on the **sandbox** form/sheet/webhook.
The moderator acts as invigilator for the unlock step using CRC Admin → *Unlock Session*.

| # | Scenario (read verbatim) | Success condition | Budget |
|---|--------------------------|-------------------|--------|
| L1 | "A notification pops up and your screen drops out of fullscreen. Carry on." *(moderator simulates a system interruption — see master-plan §9)* | Student keeps working; when asked "was that a violation?", says **no**; sees/acknowledges the blue "NOT counted" notice; violation count still reads **0 of 4** | 90 s |
| L2 | "Answer two more questions. Then trigger a real flag any way you can (switch apps, or use a shortcut we said was blocked) — we want to see what happens." | Student notices the toast **and** the badge moving to **1 of 4**; does not stop or panic; can say what a 4th flag means | 120 s |
| L3 | "Keep going. You now have 3 flags. What does the counter tell you?" | Student reads the count and threshold without prompting; no fraction confusion | 30 s |
| L4 | "Trigger the 4th flag." | Lockout appears; student reads it, states the cause and the recovery step ("contact invigilator"); **popup opened here**: does it say "locked" or something else? | 90 s |
| L5 | "Your invigilator says you're unlocked. Go back to the exam and finish question 4, then submit." | Student returns to a **reset** exam (0 of 4), finishes, submits, sees Google's confirmation, and trusts it (≥8/10) | 180 s |
| L6 | (popup probe, end) "Open the CRC icon in the toolbar. What does it show now?" | Student can read the state; report whether it matches what just happened | 60 s |

**SR variant (n ≥ 1):** rerun L4 with a screen reader. Success = the lockout is announced
without an overwhelming cascade of simultaneous announcements, and heading focus lands
on the lockout title.

---

## 3. Measures & targets (module-specific)

| Metric | Target |
|--------|--------|
| L1 "not counted" comprehension | ≥ 4/5 correct |
| L2 badge+toast noticing | ≥ 4/5 notice both within the task |
| L3 threshold reading | 5/5 no prompt |
| L4 lockout cause + recovery statement | ≥ 4/5 |
| L4 popup shows a locked/actionable state | **5/5 expected — currently suspected to fail (see §5)** |
| L5 resume + submit trust | ≥ 4/5, trust ≥ 8/10 |
| Popup/session mismatch events | 0 critical (any "no session" while an exam is clearly active on the tab is a P1+) |
| SUS (module included in master session) | ≥ 68 mean |
| Toast overlap/announcement-cascade observations | logged with severity; ≥ 3/5 participants unaffected = acceptable |

**Severity rule:** a popup that tells a locked-out student "no active exam session" while
the tab in front of them shows "Exam Locked" is a **P1** (contradictory state) unless the
student independently resolves it.

---

## 4. Session script (module portion)

1. Start state: student in-exam with **0 violations** (from module setup on the sandbox).
2. Run L1 → L6 in order, using the master-plan assistance rule.
3. After each of L1/L2/L4/L5, ask the probes from the master plan (not counted? count? cause? trust 0–10?).
4. End with SUS + debrief (RQ9/RQ10 probes: "when would you open the popup?", "did any two messages arrive together?").

---

## 5. Known-risk register (pre-test code findings to confirm or refute with users)

These were identified by code inspection before running; the module either confirms or
clears each with participants:

| # | Risk | Evidence | Expected severity |
|---|------|----------|-------------------|
| R-A | **Popup locked/submitted states may be unreachable** — `teardown()` sends `EXAM_INACTIVE`, which clears the background's active session, *before* `END_SESSION`. A popup opened at lockout or after submit may read "No active exam session." | background.js `EXAM_INACTIVE` → `persistActiveSession(null)`; content.js lockout + submit call `teardown()` first | P1 |
| R-B | **4th-violation toast is instantly covered** — the lockout overlay (z 2147483647) is appended after the "Violation 4 of 4" toast (z 2147483646) | content.js `showToast` then `showLockout` | P2 |
| R-C | **Announcement cascade for screen readers at lockout** — "Violation 4 of 4" (alert) + "Session finalized…" (status) + overlay (alert) can announce in quick succession | content.js lockout sequence | P2 (SR only) |
| R-D | **Co-occurring toasts overlap** — all toasts share `top:80 right:18`, so an info "NOT counted" toast and a violation toast arriving together fully overlap (newest covers oldest) | overlay.css `.crc-toast` | P2 |
| R-E | **Popup shows "N / 4" while the badge says "N of 4 — the 4th locks your exam"** — inconsistent threshold copy between surfaces | popup.js `render` vs content.js `updateViolationBadge` | P3 |

---

## 6. Report format

One page per participant (task table + issue log + affect notes) plus a roll-up:
metrics vs §3 targets, R-A…R-E confirmed/refuted with user evidence, and a P0–P3 issue
list. The module's result feeds the master-plan decision rule (any P0 = ship-blocking).
