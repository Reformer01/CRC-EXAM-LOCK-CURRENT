---
name: CRC Exam Lockdown
description: Proctoring UI for CRC Google Forms exams, student lockdown and invigilator admin.
colors:
  midnight-navy: "#0a0e1a"
  card-navy: "rgba(18, 24, 42, 0.85)"
  glass-white: "rgba(255, 255, 255, 0.04)"
  proctor-indigo: "#6366f1"
  indigo-deep: "#4f46e5"
  indigo-bright: "#818cf8"
  pass-green: "#10b981"
  warn-amber: "#f59e0b"
  urgency-orange: "#f97316"
  violation-red: "#ef4444"
  text-bright: "#f8fafc"
  text-base: "#e2e8f0"
  text-dim: "#94a3b8"
  text-muted: "#64748b"
typography:
  title:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  sm: "12px"
  md: "14px"
  lg: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.proctor-indigo}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "14px 32px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.indigo-bright}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "14px 32px"
  button-danger:
    backgroundColor: "{colors.violation-red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "14px 32px"
  input-field:
    backgroundColor: "{colors.glass-white}"
    textColor: "{colors.text-bright}"
    rounded: "{rounded.sm}"
    padding: "14px 18px"
    typography: "{typography.body}"
  toast:
    backgroundColor: "{colors.card-navy}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "16px 22px"
  timer-chip:
    backgroundColor: "{colors.pass-green}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 22px"
    typography: "{typography.mono}"
---

# Design System: CRC Exam Lockdown

## 1. Overview

**Creative North Star: "The Invigilator's Desk"**

A calm, well-ordered examination room. One proctor at a clean desk, a printed exam paper in front of them, a clock on the wall. Everything a student or invigilator needs is legible at a glance, nothing is decorative that is not functional, and the room never raises its voice. The dark navy surface is the examination hall at night: quiet, serious, and watchful, with the indigo accent as the lamp on the desk and the status colors as the only things allowed to be loud.

This system explicitly rejects the surveillance aesthetic: no red-alert walls, no blinking guilt, no dashboards that scream at their own operators. It rejects gamified consumer chrome: this is a serious exam surface, not a game. And it rejects generic admin grayness: the invigilator's tools carry the same craft as the student's exam, just quieter.

**Key Characteristics:**
- Deep navy base, indigo accent, status colors that mean something
- Glass only on overlays and floating chips, never decorative
- Mono type exclusively for time
- Feedback that informs, never accuses
- Restraint as the default; urgency is earned, not ambient

## 2. Colors: The Proctor's Palette

Dark navy field with an indigo working accent. Every saturated color carries a meaning; there is no decorative saturation.

### Primary
- **Proctor Indigo** (#6366f1): the accent and the lamp. Primary buttons, focus rings, active borders, the card's top accent line, glow behind overlays. It is the one color that says "action".

### Secondary
- **Indigo Deep** (#4f46e5): the press state of indigo, the darker half of the primary button gradient.
- **Indigo Bright** (#818cf8): the hover state of indigo, the lighter half of the primary button hover gradient.

### Tertiary
- **Pass Green** (#10b981): safe, on-track, counted-as-clean. Timer chip at rest, success toasts, milestone celebrations, popup "in progress" dot.
- **Warn Amber** (#f59e0b): warning threshold. Timer chip past 30 minutes, violation badge at 2, the time warnings.
- **Urgency Orange** (#f97316): harder warning. Timer chip past 15 minutes.
- **Violation Red** (#ef4444): violation, danger, lockout. Timer chip past 5 minutes, violation badge at 3 and above, danger buttons, error toasts.

### Neutral
- **Midnight Invigilation** (#0a0e1a): the surface. Fullscreen overlay background, popup background.
- **Card Navy** (rgba(18, 24, 42, 0.85)): glass card surface with a 24px blur, used only for overlays and the popup.
- **Glass White** (rgba(255, 255, 255, 0.04)): input fill and quiet surfaces.
- **Text Bright** (#f8fafc): primary headings and emphasized text on dark.
- **Text Base** (#e2e8f0): body text.
- **Text Dim** (#94a3b8): secondary text, placeholder-adjacent.
- **Text Muted** (#64748b): tertiary text, footnotes, brand lines.

### Named Rules
**The Only-Loud-Color Rule.** At rest the surface is navy and indigo. The only saturated colors allowed anywhere are the four status colors, and each one appears only in its meaning: green for safe, amber for caution, orange for harder caution, red for violation. If a red element is not a violation, warning, or destructive action, it is wrong.

**The Glass-Only-on-Overlay Rule.** Backdrop blur appears only on the fullscreen overlay card, floating chips (timer, badge, toast), and the popup. Glass is a way to layer the exam over the form, never a decorative surface treatment.

## 3. Typography

**Display Font:** Inter (with system-ui and sans-serif fallbacks)
**Label/Mono Font:** JetBrains Mono (with Cascadia Code and monospace fallbacks)

**Character:** Inter carries the voice of a printed exam paper: precise, neutral, confident without shouting. JetBrains Mono is reserved for time, because time is the one number a student should never have to decode.

### Hierarchy
- **Title** (Inter 800, 26px, line-height 1.25, -0.025em): overlay card headings ("CRC Exam Lockdown", "Exam Locked"). One heading per surface.
- **Body** (Inter 400, 15px, line-height 1.65): card copy, toasts, buttons. Cap line length around 60-70ch on card text.
- **Label** (Inter 700, 11px, letter-spacing 0.08em, uppercase): rules panel titles, brand lines, section kickers.
- **Mono** (JetBrains Mono 700, 20px, line-height 1.2): the countdown timer. Escalates with the status colors, never with weight.

### Named Rules
**The Timer Rule.** Time is always mono. The countdown timer is the only place JetBrains Mono appears in the student surface, and it never changes weight, only color. A student should read the time the way they read a wall clock.

**The One-Heading Rule.** One Title per surface. A card gets one h2, a popup gets one h1. Hierarchy is built with labels and weight, not by stacking headings.

## 4. Elevation

Flat by default, with accent glow. Surfaces at rest are flat navy with hairline borders (rgba(255,255,255,0.08-0.12)). Depth is expressed two ways: the indigo glow behind active surfaces, and glass layering over the form. The overlay card sits above the blurred form with a single soft shadow; floating chips carry a small drop shadow (0 4-8px, black at 0.30-0.35) so they read as pinned to the glass, not floating on top of content.

### Shadow Vocabulary
- **Card shadow** (`0 8px 40px rgba(0,0,0,0.45)`): the fullscreen overlay card. The only large shadow in the system.
- **Chip shadow** (`0 2-4px 16-24px rgba(0,0,0,0.30-0.35)`): timer, violation badge, toasts.
- **Accent glow** (`0 4-6px 20-30px var(--crc-accent-glow)`): primary buttons and focus rings, sized to the element.

### Named Rules
**The Flat-at-Rest Rule.** No ambient elevation. A surface at rest has no shadow unless it is an overlay card, a floating chip, or a primary action. If a surface needs a shadow to be read, the hierarchy is wrong, not the shadow.

## 5. Components

### Buttons
- **Shape:** gently curved (14px radius), full-width on cards, inline elsewhere.
- **Primary:** indigo gradient (135deg, #6366f1 to #4f46e5), white 700-weight 15px text, padding 14px 32px, accent glow underneath. Hover lifts 1px and brightens (to #818cf8). Active scales to 0.96. A subtle top white sheen (rgba(255,255,255,0.12) fading to transparent) gives the button a machined face.
- **Disabled:** indigo at 25% opacity, text at 40% white, no shadow, not-allowed cursor. Disabled states carry the "Checking..." moment on Start.
- **Danger:** same shape, red gradient (#ef4444 to #dc2626), reserved for destructive confirmations.

### Inputs / Fields
- **Style:** glass fill (rgba(255,255,255,0.04)), 12px radius, 14px 18px padding, hairline white border (12%).
- **Focus:** indigo border, a 4px indigo glow ring, subtle indigo wash behind. Focus is the strongest indicator of state on the surface.
- **Error:** the card-level error line below the field (not inline per-field), shown with the input focused.
- **Placeholder:** Text Muted (#64748b).

### Overlay Card
- **Corner Style:** generously curved (24px radius).
- **Background:** Card Navy glass (rgba(18,24,42,0.85)) with a 24px backdrop blur, saturate 1.4.
- **Shadow:** the card shadow; plus a faint white hairline ring (rgba(255,255,255,0.04)).
- **Accent:** a 2px gradient line across the top (transparent to indigo to transparent). The only stripe in the system, and it is a top line, never a side stripe.
- **Internal Padding:** 48px top, 40px sides and bottom, on a max-width 480px card.

### Timer Chip
- **Style:** mono 20px 700 white on a status gradient, pinned top-right, glass blur behind. Padding 12px 22px, radius 14px.
- **States:** green at rest, amber past 30 minutes, orange past 15, red with a 1s pulse past 5. The color is the warning; the pulse is the emergency.

### Violation Badge
- **Style:** top-left glass chip (slate rgba(51,65,85,0.8), 13px 600 white), radius 12px, 10px 16px padding. Never intercepts clicks.
- **States:** neutral slate at 0-1, amber at 2, red with a gentle scale pulse at 3 and above.

### Toast
- **Style:** Card Navy glass, radius 14px, 16px 22px padding, 14px 500 white text with a 600-weight message line, max-width 380px, slides in from the right (400ms, cubic-bezier(0.16, 1, 0.3, 1)).
- **Levels:** warning (amber) for violations, error (red) for failures, info (indigo-free, neutral) for system interruptions and milestones. Info toasts say "NOT counted"; violation toasts say the count. The two voices never blur.
- **Action button:** ghost glass white (rgba(255,255,255,0.15)), 12px 800, radius 12px. Toasts pass clicks through to the form; only the action button is interactive.

### Fullscreen Re-entry Banner
- **Style:** full-width bar, glass navy, amber or neutral text depending on whether the exit counted. One action: "Re-enter Fullscreen". It appears only when re-entry fails; the system tries to re-enter silently first.

### Popup
- **Style:** the same card language at popup scale (radius 14px, Card Navy at 0.9), one status dot, one status line, one supporting note. The dot is the only color on the popup, and it is always semantic.

## 6. Do's and Don'ts

### Do:
- **Do** let status colors carry meaning and nothing else. Green means safe, amber means caution, red means violation. Never use them decoratively.
- **Do** set time in JetBrains Mono. Time is never in Inter.
- **Do** use the indigo glow for focus and primary action. A focused input and a primary button are the two brightest things on the surface.
- **Do** announce violations and system interruptions the way they are: violations in amber or red with the count, system interruptions in neutral with "NOT counted".
- **Do** keep the overlay card's top accent line as the only stripe, and only as a top line.
- **Do** keep glass to overlays, floating chips, and the popup.
- **Do** keep every heading count at one per surface.

### Don't:
- **Don't** build surveillance or big-brother aesthetics: no red-alert walls, no blinking guilt, no implied accusation. Students feel supervised, not hunted; admins are never screamed at by their own tools.
- **Don't** use consumer gamified flash: no emoji-heavy playful chrome, no candy gradients, no confetti on a serious exam surface.
- **Don't** ship generic admin grayness: the invigilator's tools carry the same craft as the student's surface, just quieter.
- **Don't** use side-stripe borders (border-left or border-right thicker than 1px as a colored accent) on cards, toasts, or alerts. Use full borders, background tints, or nothing.
- **Don't** use gradient text (background-clip: text). Emphasis comes from weight and size.
- **Don't** use glassmorphism decoratively. If a surface is not an overlay, a floating chip, or the popup, it has no blur.
- **Don't** use em dashes in UI copy. Use commas, colons, or periods.
- **Don't** let color be the only signal. Every status has a word next to it: "Violation 2/4", "NOT counted", "1 minute remaining".