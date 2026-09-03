# Usability Test Plan — CRC Exam Lockdown: Student Exam Journey

**Version:** 1.0 · **Target build:** extension v1.1.9 (manifest 1.1.9)
**Status:** Draft for review
**Owner:** Product / Proctoring team
**Recommended date range:** to be scheduled after v1.1.9 is packaged and the test web app is deployed

---

## 1. Background and objectives

CRC Exam Lockdown proctors Google Forms exams in-browser: fullscreen + attention monitoring,
violation tracking (4-strike lockout), live server reconciliation, and remote invigilator
controls. The product history surfaces three concrete reasons to test with real students:

1. **First-time test takers were the worst-affected group** during the earlier submission-loss
   incidents. Panic around violations, system notifications, and submission is the core risk.
2. **Recent changes are unverified with real users**: the pre-exam "How this exam works"
   rules panel, the "N of 4 — the 4th locks your exam" badge wording, first-violation coaching
   copy, the blue "NOT counted" system-alert toasts, positive milestones, and the submit
   confirmation flow (v1.1.1–v1.1.9).
3. A code-grounded heuristic critique scored the shipped UI at 69% compliance and explicitly
   recommended: *"A 5–8 participant usability test with real first-time students is the next
   evidence step."* This plan is that step.

### Primary objective

Determine whether a **first-time student can set up, sit, and submit a proctored exam
correctly and calmly** — without misreading a violation, panicking at a system alert,
failing to recover from a lockout, or doubting that the exam was submitted — and quantify
the gaps against target metrics.

### Secondary objectives

- Verify students understand the **rules and consequences before starting** (the panel).
- Verify students can tell **real violations from system notifications**.
- Verify students understand their **violation count and the lockout threshold** at all times.
- Verify the **lockout → invigilator unlock → resume** path is navigable by the student.
- Verify students **trust that submission succeeded** and know what to do if unsure.
- Collect benchmark SUS and task data for this release as a baseline for future iterations.

---

## 2. Research questions

| # | Question | How it will be answered |
|---|----------|--------------------------|
| RQ1 | Before starting, can students state what counts as a violation and what happens at the 4th? | Post-setup comprehension check (T1) |
| RQ2 | Does a first violation feel recoverable, not catastrophic? | Observation of affect during T3 + post-task questions |
| RQ3 | When a system-style interruption appears, do students believe it was NOT counted? | T4 + immediate self-report ("did that count against me?") |
| RQ4 | Can students read their remaining time and current violation state at a glance? | T3/T5 questions, eye/glance observation |
| RQ5 | After a lockout, does the student know what happened and what to do? | T6 (lockout recovery segment) |
| RQ6 | Do students believe their exam was submitted when they see the confirmation? | T7 + debrief |
| RQ7 | Does the fullscreen re-entry banner resolve confusion, or create it? | T3/T4 observation + debrief |
| RQ8 | Do students voluntarily use the toolbar popup, and is it useful when they do? | T8 (optional task) |

---

## 3. Participant profile

**Recruit 8, test 5–8** (recommendation: run all 8; a minimum of 5 valid sessions is
required for meaningful SUS and task data).

**Inclusion criteria** (all must hold):

- Has **never used CRC Exam Lockdown** and has never sat an exam proctored by this tool
  (first-time experience is the population of interest).
- Is a current or recent student, or is job-applying in a context where they take
  timed online assessments (proxies for real end users).
- Comfortable using Chrome on a laptop (the exam runs in Chrome; no prior
  extension knowledge needed).
- Fluent enough in the exam language to complete a written assessment.

**Stratify for spread (aim for a mix, not a quota):**

- 60–80% genuinely first-time proctored-exam takers; 20–40% who have taken proctored
  exams before (for comparison of affect and comprehension).
- At least 2 participants who self-identify as **anxious test takers**.
- At least 1 participant who primarily uses **keyboard navigation or a screen reader**
  (screen-reader users may need the in-page experience only; remote moderation still works).
- Mix of majors/programs; no prior exposure to the research.

**Exclusions:** anyone who helped build or test the extension; anyone who reviewed
earlier designs; anyone who cannot give consent.

**Recruitment:** posted call on campus/student channels; screener survey (5 questions,
~2 min) to check criteria and stratify. **Incentive:** equivalent of a meal voucher or
$15–20 gift card per completed session (align with local policy).

---

## 4. Method and environment

- **Moderated, one-on-one usability tests** — remote (Google Meet + shared screen) or
  in-person lab, depending on participant access. Remote is acceptable because the
  interaction surface is a single Chrome tab.
- **Format:** task-based scenarios with concurrent **think-aloud**. Moderator observes;
  a second note-taker logs events (or the moderator records and codes afterward).
- **Test environment (critical):**
  1. A **test Google Form** (10–12 neutral multiple-choice/short-answer questions)
     created for the study — never a live exam form.
  2. A **sandbox Google Sheet + a test deployment of the Apps Script web app**
     (`GoogleSheetsScript.gs` from the CRC-EXAM-LOCK folder, deployed with a distinct
     URL). The extension build for the test points at this **test webhook URL** — do not
     point test participants at the production webhook. This keeps the study out of
     production data and lets the moderator act as invigilator (unlock) safely.
  3. A **preconfigured Chrome profile** with the v1.1.9 extension loaded unpacked
     (developer mode). For remote sessions, walk the participant through a 2-minute
     install checklist beforehand, or send them a packaged CRX to load.
  4. **Recording** (screen + audio) with consent for later coding.
- **Test emails:** use synthetic addresses (e.g., `p01@crc-test.local`) so no personal
  data is written to the sandbox spreadsheet; record the mapping offline.
- Each session: **~45 minutes** (up to 60 for screen-reader or slower participants).

---

## 5. Task scenarios, success criteria, and time budgets

The journey is split into two segments: **A — clean first attempt** (T1–T5) and
**B — forced recovery** (T6–T7), plus **C — popup** (T8, optional). Segment B deliberately
pushes the participant to a lockout so the recovery path is observed; the moderator
explains beforehand that this segment intentionally triggers flags.

| # | Task / scenario | Start state | Success (observed) | Time budget |
|---|-----------------|-------------|--------------------|-------------|
| T1 | **Read the rules.** "You're about to start. Please read the screen and tell me in your own words: what would get you flagged, and what happens at the 4th flag?" | Setup card visible | States ≥3 of 4 rules AND the lockout consequence without prompting | ≤ 90 s |
| T2 | **Start the exam.** "Enter your details and start. The exam is 30 minutes." | Setup card | Exam enters fullscreen, timer + badge appear, name/email prefilled correctly; no validation dead-ends | ≤ 60 s |
| T3 | **Take the exam + first violation.** Answer 2 questions, then (scenario: "a colleague messages you and you glance away") minimize/blur the window briefly. | In exam | Student notices the violation toast + badge moving to "1 of 4"; affect is calm (RQ2); knows they can continue | ≤ 90 s after flag |
| T4 | **System interruption.** Moderator triggers a system-style interruption (see §9 limitation) or an OS notification while the student works. | In exam | Student self-reports the interruption was **not** counted; blue "NOT counted" info toast recognized | ≤ 60 s |
| T5 | **Submit normally.** "You're done. Submit the form." | In exam, 0–1 violations | Google confirmation appears ("Your response has been recorded"); student states the exam is submitted and closed | ≤ 60 s |
| T6 | **Lockout recovery.** New short form attempt (or same session reset by moderator): intentionally trigger 4 flags (Ctrl+C ×2, blur, F12). Moderator then unlocks from the sandbox sheet ("the invigilator has unlocked you"). | Locked screen ("Exam Locked") | Student reads the lockout message, understands the cause and the "contact your invigilator" step, then resumes after unlock and continues answering | ≤ 120 s |
| T7 | **Submit after recovery.** Complete + submit after the unlock. | Resumed exam | Submission confirmed; student trusts it went through (RQ6) | ≤ 60 s |
| T8 | **Toolbar popup** (optional, time permitting). "Look at the CRC icon in the toolbar. What does it tell you?" | Mid-exam or post-submit | Student can read session status/time/violations; reports whether it is useful | ≤ 60 s |

**Assistance rule:** the moderator may give one neutral prompt per task ("take another look
at the top of the screen") after a task is clearly stuck for >20 s. Any prompt counts as an
assist and is logged; "completed with assist" is scored separately from "completed
independently".

**Comprehension probes (post-task, not scored):**

- T1: "If you get 3 flags and keep going, what happens on the 4th?" (expect: it locks)
- T4: "Did that meeting alert put a flag on your record?" (expect: no)
- T5: "How sure are you, 0–10, that your answers were saved?" (target ≥ 8)
- T6: "Who do you contact to get back in, and what do you tell them?" (expect: invigilator; session/name)

---

## 6. Measures and success targets

### Quantitative

| Metric | Definition | Target |
|--------|-----------|--------|
| Task completion rate | Tasks completed independently (no assist) ÷ total tasks, per participant and aggregate | **≥ 85%** (≥ 90% for T2, T5, T7) |
| Time on task | Observed time per task vs budget in §5 | ≤ budget for ≥ 80% of tasks |
| Error count per task | Wrong input, wrong action, or misread state (e.g., misread the count, closed without submitting) | **0 critical errors**; mean ≤ 1 minor error per task |
| Assists | Neutral prompts given by moderator | ≤ 1 per participant on average |
| SUS score | Standard 10-item SUS at end of session | **Mean ≥ 68** (industry average), stretch **≥ 80** |
| Comprehension | T1 rules recall + threshold statement | ≥ 80% of participants state ≥ 3 rules + the 4th-lock consequence |
| Trust in submission | 0–10 self-report after T5/T7 | Mean ≥ 8 |
| Screen-reader session (n ≥ 1) | All of the above run with a screen reader; note announced vs missed content | No blocking failures; log gaps |

### Qualitative (coded from recording)

- **Affect markers** during violations/lockout: verbal ("did I fail?", "is it over?")
  and non-verbal (sighs, freezing). Coded calm / neutral / anxious.
- **Issue log** with severity: **P0** blocks task or loses work; **P1** serious confusion
  or wrong action; **P2** minor friction; **P3** polish. Every observation tied to the
  screen element and task.
- Notable quotes for the report (verbatim, anonymized).

### Pass/fail decision rule (for release confidence)

Ship-blocking if any **P0** occurs (e.g., a student believes their exam was lost after
submitting, cannot tell a violation from a system alert, or cannot recover from lockout
without moderator help beyond one prompt). Otherwise, fixes follow the P1 → P2 priority
order in the issue log.

---

## 7. Session flow and script outline

| Phase | Duration | Content |
|-------|----------|---------|
| Intro & consent | 5 min | Purpose, recording consent, right to stop, think-aloud warm-up question ("think aloud as you tell me how you'd book a flight") |
| Pre-test questionnaire | 3 min | Experience with proctored exams; anxiety self-rating (1–5); screen reader / keyboard use; today's browser setup check |
| Segment A (T1–T5) | 15 min | Clean first attempt on the test form, per §5 |
| Short break | 2 min | Reset state; explain Segment B intent |
| Segment B (T6–T7) | 8 min | Forced lockout + unlock + resume + submit |
| Segment C (T8) | 3 min | Toolbar popup exploration (optional) |
| SUS + post-task questions | 6 min | SUS form (10 items) + debrief questions |
| Debrief | 3 min | Explain the study's intent; invite questions; thank + incentive |

**Moderator script essentials:** every task read verbatim from the script (no rephrasing
that leaks answers); one probe allowed after each task; never confirm "correct" during a
task; note where participants look when a toast appears.

---

## 8. Instruments (to be assembled before pilot)

1. **Screener survey** (5 questions) — inclusion/exclusion + stratification.
2. **Consent form** — recording, synthetic data, anonymity, right to withdraw.
3. **Session script** — verbatim task wording, probes, assistance rule.
4. **Observation sheet** — per task: start/end time, completion (independent/assist/fail),
   errors, assists, affect, notes; per session: issue log with severities.
5. **SUS questionnaire** — the standard 10 items (odd-numbered positive, even-numbered
   negative; scored 1–5, converted to 0–100 per the SUS method).
6. **Debrief guide** — open questions mapped to RQ2/RQ3/RQ5/RQ6/RQ8.
7. **Test infrastructure checklist** — test Google Form, sandbox sheet, test webhook
   deployment, preconfigured Chrome profile, recording gear, synthetic emails.

---

## 9. Risks, limitations, and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Testing against the production webhook/sheet contaminates real data | High | Test deployment of `GoogleSheetsScript.gs` with its own URL + sandbox sheet; extension build pointed at the test URL (verify before every session) |
| Real OS system notifications are hard to trigger on demand | Medium | Simulate the "system interruption" with a moderator-sent notification or a pre-arranged OS alert; disclose to participants after the session that it was simulated. The classification logic (grace periods, info toasts) is still observable |
| Violations are stressful; Segment B could upset anxious participants | Medium | Explicit pre-segment framing ("this part intentionally triggers flags — nothing is wrong"), check-in after T6, right to stop at any time |
| Extension install friction in remote sessions | Medium | Preconfigured Chrome profile for lab sessions; 2-minute guided install for remote; reserve 5 min of session for install |
| Lab ≠ real stakes, so panic may be understated | Low | Recruit self-identified anxious test takers; scenario framing ("your grade depends on this") where ethical |
| Small n (5–8) limits statistics | Known | This is formative research; report per-participant detail, not significance tests; SUS is directional, not a benchmark proof |
| Screen-reader coverage depends on recruitment | Known | Target ≥ 1 SR user; if none, note the gap and schedule a separate SR pass |

---

## 10. Roles and schedule

- **Moderator (1):** runs sessions, reads the script.
- **Note-taker/coder (1):** logs observation sheets live; codes recordings afterward.
- **Invigilator-actor:** the moderator (or a second person on the sandbox sheet) performs
  the unlock in T6 using the CRC Admin → *Unlock Session* flow, mirroring the real
  invigilator role.
- **Analyst:** scores tasks/SUS, codes issues, writes the report.

**Suggested schedule:** 2 pilot sessions (may be internal staff who meet criteria) →
refine script → 8 recorded sessions over 2–3 days → 1 week for coding and analysis →
report with issue log, metrics vs targets, and prioritized fixes.

---

## Appendix A — Deliverables after the test

1. Metrics summary vs the §6 targets (completion, time, errors, SUS, trust).
2. Severity-ranked issue log (P0–P3) with screenshots/annotations.
3. Per-persona journey notes for first-time vs experienced test takers.
4. Recommended fixes mapped to the codebase surfaces (setup card, toasts/badge,
   lockout, submit/confirmation), ready to hand to implementation.
