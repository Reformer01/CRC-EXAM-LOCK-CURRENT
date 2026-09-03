'use strict';
/* Lockout + system-notification flows through the REAL popup.js (from the
   automated pilot of USABILITY-TEST-LOCKOUT-SYSFLOW.md). All five pilot
   findings (R-A / R-C / R-D / R-E / R-F) are now fixed and covered as plain
   checks; every student-facing violation count uses the same "N of 4"
   language (badge, toasts, lockout overlay, popup). */
const assert = require('assert');
const H = require('../helpers/harness');

module.exports = async function run(t) {
  /* ---------- P1: full journey — interruption, lockout, recovery, submit ---------- */
  {
    const w = H.createWorld({});
    await w.startExam('Nadia', 'nadia@crc-test.local');
    let s = w.snapshot();
    await t.check('P1: start shows timer + 0-of-4 badge', () => {
      assert.ok(s.timerPresent && s.badgeText && s.badgeText.includes('0 of 4'), JSON.stringify(s.badgeText));
    });

    w.fireDoc('fullscreenchange', {});
    await H.tick(200);
    s = w.snapshot();
    await t.check('P1: system interruption → NOT-counted info toast (role=status), count stays 0', () => {
      const info = s.toasts.find(x => x.cls.includes('crc-toast--info'));
      assert.ok(info && info.role === 'status' && /NOT counted/.test(info.text), JSON.stringify(info));
      assert.ok(s.badgeText.includes('0 of 4'), s.badgeText);
    });

    const keys = [H.keyEvt('F12'), H.keyEvt('c', { ctrlKey: true }), H.keyEvt('PrintScreen'), H.keyEvt('i', { ctrlKey: true, shiftKey: true })];
    for (let i = 0; i < 4; i++) { w.fireDoc('keydown', keys[i]); await H.tick(1600); }
    s = w.snapshot();
    await t.check('P1: lockout overlay (role=alert, reason text, "N of 4"), timer removed', () => {
      const full = w.overlays()[w.overlays().length - 1].innerHTML;
      assert.ok(s.overlay && s.overlay.role === 'alert' && s.overlay.html.includes('maximum of 4 violations'), JSON.stringify(s.overlay));
      assert.ok(full.includes('Violations: <strong>4 of 4</strong>'), 'overlay count not N of 4: ' + full);
      assert.ok(!full.includes('/ 4'), 'fraction format leaked into the overlay');
      assert.ok(!s.timerPresent);
    });
    const ov = w.bodyEl.children.find(c => c.className === 'crc-overlay');
    const title = ov && ov._qs && ov._qs['#crc-lockout-title'];
    await t.check('P1: lockout heading receives focus', () => {
      assert.ok(title && title._focused === true);
    });

    const popLocked = H.runPopup(w);
    await H.tick(80);
    await t.check('P1: popup at lockout shows an actionable locked state (R-A fixed)', () => {
      assert.ok(/exam locked/i.test(popLocked['popup-status-text'].textContent), 'popup says: "' + popLocked['popup-status-text'].textContent + '"');
      assert.ok(/invigilator/.test(popLocked['popup-note'].textContent), 'no unlock guidance');
    });

    /* R-F: no unlock polling on the violation-lockout path */
    w.cfg.session = { sessionId: 'crc_p1_1', unlocked: true, clearedAt: new Date().toISOString(), status: 'Active', violationCount: 0, startTime: new Date(Date.now() - 120000).toISOString(), durationMs: 3600000 };
    await H.tick(5200);
    s = w.snapshot();
    await t.check('P1: admin unlock clears the lockout without a reload (R-F fixed)', () => {
      assert.ok(!s.overlay, 'still locked after 5.2s');
    });

    /* recovery via reload (the path that exists today) */
    const key = 'crcSession_' + H.FORM_ID;
    const saved = w.storageData[key];
    const srv = { sessionId: 'crc_p1_1', unlocked: false, clearedAt: '', status: 'Locked (Violations)', violationCount: 4, startTime: new Date(Date.now() - 120000).toISOString(), durationMs: 3600000 };
    const w2 = H.createWorld({ session: srv }, { [key]: saved });
    await H.tick(300);
    await t.check('P1: reload boots into lockout and starts unlock polling', () => {
      assert.ok(w2.snapshot().overlay && w2.snapshot().overlay.role === 'alert');
    });
    srv.unlocked = true;
    srv.clearedAt = new Date().toISOString();
    srv.violationCount = 0;
    srv.status = 'Active';
    let resumed = false;
    for (let i = 0; i < 40 && !resumed; i++) { await H.tick(500); resumed = !w2.snapshot().overlay; }
    s = w2.snapshot();
    await t.check('P1: unlock adopted after reload + poll; count reset', () => {
      assert.ok(resumed, 'never unlocked');
      assert.ok(s.badgeText && s.badgeText.includes('0 of 4'), s.badgeText);
    });

    await H.tick(200);
    w2.bodyEl.innerText = 'Your response has been recorded';
    w2.fireObserver();
    await H.tick(300);
    s = w2.snapshot();
    await t.check('P1: clean submit after recovery shows the no-violations toast', () => {
      assert.ok(s.toasts.some(x => /no violations on record/.test(x.text)), JSON.stringify(s.toasts.map(x => x.text)));
    });
    const popDone = H.runPopup(w2);
    await H.tick(80);
    await t.check('P1: popup after submit shows the submitted state (R-A fixed)', () => {
      assert.ok(/submitted|recorded/i.test(popDone['popup-status-text'].textContent), 'popup says: "' + popDone['popup-status-text'].textContent + '"');
    });
  }

  /* ---------- P2: held-key repeat guard + interruption throttle ---------- */
  {
    const w = H.createWorld({});
    await w.startExam('Marcus', 'marcus@crc-test.local');
    for (let i = 0; i < 12; i++) w.fireDoc('keydown', H.keyEvt('c', { ctrlKey: true, repeat: true }));
    await H.tick(120);
    await t.check('P2: 12 held-key repeats count zero violations', () => {
      assert.ok(w.snapshot().badgeText.includes('0 of 4'));
    });
    w.fireDoc('keydown', H.keyEvt('c', { ctrlKey: true }));
    await H.tick(1600);
    await t.check('P2: one real press counts exactly once', () => {
      assert.ok(w.snapshot().badgeText.includes('1 of 4'), w.snapshot().badgeText);
    });
    w.fireDoc('fullscreenchange', {});
    await H.tick(200);
    w.fireDoc('fullscreenchange', {});
    await H.tick(200);
    const s = w.snapshot();
    await t.check('P2: repeated interruptions stay uncounted and throttle to one info toast', () => {
      const infoCount = s.toasts.filter(x => x.cls.includes('crc-toast--info')).length;
      assert.strictEqual(infoCount, 1, 'info toasts: ' + infoCount);
      assert.ok(s.badgeText.includes('1 of 4'), s.badgeText);
    });
  }

  /* ---------- P3 (screen reader): announcement cascade at lockout ---------- */
  {
    const w = H.createWorld({});
    await w.startExam('Priya', 'priya@crc-test.local');
    const sequence = [];
    const seen = new Set();
    const probe = setInterval(() => {
      const now = Date.now();
      const snap = w.snapshot();
      snap.toasts.forEach(x => {
        if (x.role && !seen.has('t:' + x.text)) { seen.add('t:' + x.text); sequence.push({ kind: 'toast', role: x.role, at: now }); }
      });
      if (snap.overlay && snap.overlay.role && !seen.has('o')) { seen.add('o'); sequence.push({ kind: 'overlay', role: snap.overlay.role, at: now }); }
    }, 15);
    const keys = [H.keyEvt('F12'), H.keyEvt('c', { ctrlKey: true }), H.keyEvt('PrintScreen'), H.keyEvt('Insert', { shiftKey: true })];
    for (let i = 0; i < 4; i++) { w.fireDoc('keydown', keys[i]); await H.tick(1600); }
    clearInterval(probe);
    await t.check('P3: lockout announced via role=alert', () => {
      assert.ok(sequence.some(e => e.kind === 'overlay' && e.role === 'alert'));
    });
    const ov = sequence.find(e => e.kind === 'overlay');
    await t.check('P3: announcement cascade at lockout is ≤ 2 (R-C fixed)', () => {
      const cascade = sequence.filter(e => ov && Math.abs(e.at - ov.at) < 500).length;
      assert.ok(cascade <= 2, 'cascade ' + cascade);
    });
  }

  /* ---------- P4: info + violation toast co-occurrence; popup in progress ---------- */
  {
    const w = H.createWorld({});
    await w.startExam('Tom', 'tom@crc-test.local');
    w.fireDoc('fullscreenchange', {});
    await H.tick(150);
    w.fireDoc('keydown', H.keyEvt('c', { ctrlKey: true }));
    await H.tick(150);
    const s = w.snapshot();
    await t.check('P4: info + violation toasts coexist with distinct stacking offsets (R-D fixed)', () => {
      const liveEls = w.toasts().filter(x => !x.className.includes('--exit'));
      assert.ok(liveEls.some(x => x.className.includes('crc-toast--info')), 'no info toast');
      assert.ok(liveEls.some(x => x.className.includes('crc-toast--warning') || x.className.includes('crc-toast--error')), 'no violation toast');
      const tops = liveEls.map(x => x.style.top).filter(t => t);
      assert.strictEqual(new Set(tops).size, liveEls.length, 'overlapping offsets: ' + tops.join(', '));
      assert.ok(tops.length >= 2, 'stacking not applied: ' + tops.join(', '));
    });
    const pop = H.runPopup(w);
    await H.tick(80);
    await t.check('P4: popup in-progress shows live session details', () => {
      assert.strictEqual(pop['popup-details'].style.display, 'flex');
      assert.ok(pop['popup-violations'].textContent.length > 0);
    });
    await t.check('P4: popup violation wording matches the badge (R-E fixed)', () => {
      assert.strictEqual(pop['popup-violations'].textContent,
        '1 of 4 — the 4th locks your exam', 'popup says "' + pop['popup-violations'].textContent + '"');
      assert.ok(!/\/ 4/.test(pop['popup-violations'].textContent), 'fraction format leaked into the popup');
    });
  }

  /* ---------- P5: interruptions then clean submit ---------- */
  {
    const w = H.createWorld({});
    await w.startExam('Ana', 'ana@crc-test.local');
    w.fireDoc('fullscreenchange', {});
    await H.tick(200);
    w.fireDoc('fullscreenchange', {});
    await H.tick(200);
    await t.check('P5: interruptions never counted (0 of 4)', () => {
      assert.ok(w.snapshot().badgeText.includes('0 of 4'));
    });
    w.bodyEl.innerText = 'Your answer has been recorded';
    w.fireObserver();
    await H.tick(300);
    await t.check('P5: clean submit toast says no violations on record', () => {
      assert.ok(w.snapshot().toasts.some(x => /no violations on record/.test(x.text)), JSON.stringify(w.snapshot().toasts.map(x => x.text)));
    });
    const st = await w.getStatus();
    await t.check('P5: session finalized server-side after submit', () => {
      assert.ok(st.active === false || (st.live && st.live.isSubmitted), JSON.stringify(st));
    });
  }
};
