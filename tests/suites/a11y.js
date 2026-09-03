'use strict';
/* Accessibility regression (v1.1.8/1.1.9): WCAG contrast math, template
   structure (labels/headings/roles), and runtime toast/badge behavior. */
const assert = require('assert');
const H = require('../helpers/harness');

function between(src, a, b) {
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i !== -1 && j !== -1 && j > i, 'markers not found: ' + a);
  return src.slice(i, j);
}

/* ---------- WCAG contrast math ---------- */
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function composite(fgHex, a, bgHex) {
  const f = fgHex.replace('#', ''), b = bgHex.replace('#', '');
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const c = Math.round(parseInt(f.slice(i * 2, i * 2 + 2), 16) * a + parseInt(b.slice(i * 2, i * 2 + 2), 16) * (1 - a));
    out += c.toString(16).padStart(2, '0');
  }
  return out;
}

const CARD = composite('#12182a', 0.85, '#0a0e1a');   // card over overlay navy
const POPCARD = composite('#12182a', 0.9, '#0c1021'); // popup card over popup bg
const INPUTBG = composite('#ffffff', 0.04, CARD);     // glass input over card

const AA = 4.5, LARGE = 3.0;
const pairs = [
  /* toasts: white 14px text on every gradient stop */
  ['#ffffff', '#b45309', AA], ['#ffffff', '#92400e', AA],
  ['#ffffff', '#dc2626', AA], ['#ffffff', '#991b1b', AA],
  ['#ffffff', '#4f46e5', AA], ['#ffffff', '#4338ca', AA],
  /* success (finish-line) toast */
  ['#ffffff', '#047857', AA], ['#ffffff', '#065f46', AA],
  /* timer: white 20px bold text (large text) on every stop */
  ['#ffffff', '#059669', LARGE], ['#ffffff', '#047857', LARGE],
  ['#ffffff', '#d97706', LARGE], ['#ffffff', '#b45309', LARGE],
  ['#ffffff', '#ea580c', LARGE], ['#ffffff', '#c2410c', LARGE],
  ['#ffffff', '#dc2626', LARGE], ['#ffffff', '#991b1b', LARGE],
  /* violation badge, fs banner, action buttons */
  ['#ffffff', '#b45309', AA], ['#ffffff', '#dc2626', AA],
  ['#ffffff', composite('#000000', 0.22, '#dc2626'), AA],
  ['#ffffff', composite('#000000', 0.22, '#b45309'), AA],
  ['#ffffff', composite('#000000', 0.22, '#4f46e5'), AA],
  /* brand footer, dim text, placeholders, body text on card/popup */
  ['#a5b4fc', CARD, AA], ['#94a3b8', CARD, AA], ['#94a3b8', INPUTBG, AA], ['#e2e8f0', CARD, AA],
  ['#94a3b8', '#0c1021', AA], ['#94a3b8', POPCARD, AA],
];

module.exports = async function run(t) {
  const css = H.overlayCssSrc();
  const popupCss = H.popupCssSrc();

  await t.check('contrast ratios pass WCAG thresholds', () => {
    const bad = [];
    for (const [fg, bg, min] of pairs) {
      const r = ratio(fg, bg);
      if (r < min) bad.push(fg + ' on ' + bg + ': ' + r.toFixed(2));
    }
    assert.strictEqual(bad.length, 0, bad.join('; '));
  });

  const setup = between(H.contentSrc, 'showSetup () {', 'showLockout (reason)');

  await t.check('setup card has a single h1 + h2 rules heading', () => {
    assert.ok(setup.includes('<h1 id="crc-setup-title">'));
    assert.strictEqual((setup.match(/<h1/g) || []).length, 1);
    assert.ok(setup.includes('<h2 class="crc-rules__title" id="crc-rules-heading">'));
  });

  await t.check('every setup input has a real (sr-only) label before it', () => {
    for (const [id, text] of [['crc-name-input', 'Full name'], ['crc-email-input', 'Email address'], ['crc-duration-input', 'Exam duration']]) {
      const label = `<label class="crc-sr-only" for="${id}">${text}</label>`;
      assert.ok(setup.includes(label), 'missing label: ' + id);
      assert.ok(setup.indexOf(label) < setup.indexOf(`id="${id}"`), 'label not before input: ' + id);
    }
    assert.ok(setup.includes('style="display:none" role="alert"'), 'error region lacks role=alert');
  });

  await t.check('lockout overlay announces via role=alert, h1 with tabindex, no inline fail color', () => {
    assert.ok(H.contentSrc.includes("overlay.setAttribute('role', 'alert');"));
    assert.ok(setup === setup || H.contentSrc.includes('<h1 id="crc-lockout-title" tabindex="-1">'), 'lockout h1 missing');
    assert.ok(H.contentSrc.includes('class="crc-lockout-help"'));
    assert.ok(!H.contentSrc.includes('#64748b'), 'inline #64748b still present');
    assert.ok(H.contentSrc.includes('Violations: <strong>${this.state.violationCount} of ${CFG.MAX_VIOLATIONS}</strong>'),
      'lockout overlay not N of 4');
    assert.ok(!H.contentSrc.includes('${this.state.violationCount} / ${CFG.MAX_VIOLATIONS}'), 'fraction still in overlay');
  });

  await t.check('toast role logic (info/success polite, everything else assertive)', () => {
    assert.ok(H.contentSrc.includes("t.setAttribute('role', (level === 'info' || level === 'success') ? 'status' : 'alert');"));
  });

  await t.check('rules-and-consequences copy + legible badge/toast wording', () => {
    assert.ok(setup.includes('The <b>4th violation</b> locks your exam'), 'consequence bullet missing');
    assert.ok(H.contentSrc.includes('of ${CFG.MAX_VIOLATIONS} — the ${ordinal(CFG.MAX_VIOLATIONS)} locks your exam'), 'badge wording missing');
    assert.ok(H.contentSrc.includes('function ordinal (n)'), 'ordinal helper missing');
    assert.ok(H.contentSrc.includes("'⚠️ Violation 1 of ' + CFG.MAX_VIOLATIONS"), 'toast fraction not aligned');
  });

  await t.check('every student-facing count render uses N of 4, never N / 4', () => {
    /* no fraction renderer remains in the extension surfaces */
    for (const src of [H.contentSrc, H.popupSrc]) {
      assert.ok(!/\/ ' \+ MAX_VIOLATIONS/.test(src), 'fraction concat in surface');
      assert.ok(!/\/ \$\{MAX_VIOLATIONS\}/.test(src), 'fraction template in surface');
    }
    assert.ok(H.popupSrc.includes("' of ' + MAX_VIOLATIONS + ' — the ' + ordinal(MAX_VIOLATIONS) + ' locks your exam'"), 'popup not N of 4');
  });

  await t.check('focus-visible rings + sr-only utility exist; legacy CSS gone', () => {
    for (const sel of ['.crc-btn:focus-visible', '.crc-toast__btn:focus-visible', '.crc-fs-banner__btn:focus-visible']) {
      assert.ok(css.includes(sel), 'missing ' + sel);
    }
    assert.ok(css.includes('.crc-sr-only'));
    assert.ok(!css.includes('.crc-rule-icon'), 'legacy rules CSS remains');
    assert.ok(!css.includes('rgba(99,102,241,0.35)'));
    assert.ok(css.includes('color: #a5b4fc;'));
    assert.strictEqual((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, 'unbalanced braces');
  });

  await t.check('setup card scrolls internally on short screens instead of clipping', () => {
    const card = between(css, '.crc-card {', '@keyframes crc-cardEnter');
    assert.ok(card.includes('max-height: calc(100vh - 32px)'), 'card never height-capped');
    assert.ok(card.includes('overflow-y: auto'), 'card does not scroll');
    assert.ok(card.includes('overscroll-behavior: contain'), 'scroll chains to the page');
    assert.ok(css.includes('.crc-card::-webkit-scrollbar-thumb'), 'no themed scrollbar');
    assert.ok(css.includes('@media (max-height: 780px)'), 'no short-screen compaction pass');
    const compact = css.slice(css.indexOf('@media (max-height: 780px)'));
    assert.ok(compact.includes('.crc-rules li'), 'rules not compacted on short screens');
    assert.ok(compact.includes('.crc-input'), 'inputs not compacted on short screens');
    assert.strictEqual((compact.match(/{/g) || []).length, (compact.match(/}/g) || []).length, 'unbalanced media braces');
  });

  await t.check('no translucent loud-chip gradients remain in overlay.css', () => {
    for (const pat of ['rgba(245,158,11,0.9)', 'rgba(239,68,68,0.9)', 'rgba(16,185,129,0.85)',
      'rgba(249,115,22,0.85)', 'rgba(245,158,11,0.75)', 'rgba(239,68,68,0.8)', 'rgba(239,68,68,0.95)']) {
      assert.ok(!css.includes(pat), 'still present: ' + pat);
    }
  });

  await t.check('popup footer + dim pass (token change) with focus ring', () => {
    assert.ok(popupCss.includes('--pop-dim:      #94a3b8;'));
    assert.ok(!popupCss.includes('rgba(100,116,139,0.5)'));
    assert.ok(popupCss.includes('color: var(--pop-dim);') && popupCss.includes('.popup-btn:focus-visible'));
    assert.strictEqual((popupCss.match(/{/g) || []).length, (popupCss.match(/}/g) || []).length, 'unbalanced popup braces');
  });

  /* ---- runtime ---- */
  const w = H.createWorld({});
  await H.tick(40);
  await t.check('setup overlay is not announced as an alert region', () => {
    const o = w.overlays()[0];
    assert.ok(o, 'no setup overlay');
    assert.ok(!o.getAttribute('role'));
  });

  await w.startExam('A11y', 'a11y@crc-test.local');
  await t.check('violation toast is role=alert and 4th locks with role=alert overlay', async () => {
    for (let i = 0; i < 4; i++) {
      w.fireDoc('keydown', H.keyEvt('F12'));
      await H.tick(1600);
    }
    const alerts = w.snapshot().toasts.filter(t => t.role === 'alert');
    assert.ok(alerts.length > 0, 'no alert-role toast after F12');
    const locked = w.overlays()[w.overlays().length - 1];
    assert.strictEqual(locked.getAttribute('role'), 'alert', 'lockout overlay not announced');
    /* unified N of 4 language on the rendered overlay */
    assert.ok(locked.innerHTML.includes('Violations: <strong>4 of 4</strong>'), locked.innerHTML);
    assert.ok(!locked.innerHTML.includes('/ 4'), 'fraction in rendered lockout');
  });

  /* fresh profile for the badge wording check */
  const w2 = H.createWorld({});
  await w2.startExam('A11y2', 'a11y2@crc-test.local');
  await H.tick(50);
  const badgeEl = () => w2.bodyEl.children.find(c => String(c.className || '').indexOf('crc-violation-badge') === 0);
  const liveEl = () => w2.bodyEl.children.find(c => String(c.className || '').indexOf('crc-violation-badge-live') === 0);
  await t.check('badge live region is polite/atomic and silent on first paint', () => {
    const l = liveEl();
    assert.ok(l, 'no badge live region');
    assert.ok(l.className.includes('crc-sr-only'), 'live region not visually hidden');
    assert.strictEqual(l.getAttribute('role'), 'status', 'not polite');
    assert.strictEqual(l.getAttribute('aria-atomic'), 'true', 'not atomic');
    assert.strictEqual(l.textContent, '', 'announced an unprovoked first paint');
  });

  await t.check('violation badge reads N of 4 with the lock consequence', async () => {
    const b0 = badgeEl();
    assert.ok(b0, 'no badge');
    assert.ok(/^⚠️ Violations: 0 of 4 — the 4th locks your exam$/.test(b0.textContent), 'badge text: ' + b0.textContent);
    w2.fireDoc('keydown', H.keyEvt('F12'));
    await H.tick(1600);
    const b1 = badgeEl();
    assert.ok(/^⚠️ Violations: 1 of 4 — the 4th locks your exam$/.test(b1.textContent), 'badge after 1: ' + b1.textContent);
    assert.ok(b1.className.indexOf('crc-violation-badge--') === -1, 'badge flagged warn at 1');
    assert.strictEqual(liveEl().textContent,
      'Violation 1 of 4 — the 4th locks your exam.', 'live: ' + liveEl().textContent);
  });

  await t.check('badge count changes are announced even without a new toast', async () => {
    w2.fireDoc('keydown', H.keyEvt('F12'));
    await H.tick(1600);
    assert.strictEqual(liveEl().textContent,
      'Violation 2 of 4 — the 4th locks your exam.', 'live after 2: ' + liveEl().textContent);
    assert.ok(badgeEl().textContent.includes('2 of 4'), 'visual badge did not follow');
  });
};
