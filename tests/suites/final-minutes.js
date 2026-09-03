'use strict';
/* Final-minutes UX (v1.1.10):
   - a calm pre-submit checklist shows once when ~3 minutes remain
   - a clean exam finishes with a dedicated success toast, not a routine one */
const assert = require('assert');
const H = require('../helpers/harness');

module.exports = async function run(t) {
  await t.check('F1: final-stretch checklist copy + once-only flag exist', () => {
    assert.ok(H.contentSrc.includes('final-stretch pre-submit checklist'), 'checklist comment/flag missing');
    assert.ok(H.contentSrc.includes('this.finalStretchShown = false;'), 'flag not initialized');
    assert.ok(H.contentSrc.includes('stay on the confirmation page'), 'checklist copy missing');
    assert.ok(H.contentSrc.includes("secs <= 3 * 60"), 'fires outside the final 3 minutes');
    assert.ok(H.contentSrc.includes('9000'), 'no extended duration for the checklist');
  });

  await t.check('F2: success toast is polite, gets no fullscreen button, and has its own copy', () => {
    assert.ok(H.contentSrc.includes("(level === 'info' || level === 'success') ? 'status' : 'alert'"), 'success not polite');
    assert.ok(H.contentSrc.includes("level !== 'info' && level !== 'success'"), 'success may show fullscreen button');
    assert.ok(H.contentSrc.includes("'🎉 Exam submitted — no violations on record. You\\'re all set!'"), 'celebration copy missing');
    assert.ok(H.overlayCssSrc().includes('.crc-toast--success'), 'success CSS class missing');
    assert.ok(H.overlayCssSrc().includes('crc-toastSettle'), 'celebratory entry animation missing');
  });

  /* runtime: checklist appears in the final minutes and only once */
  await t.check('F3: checklist shows once as a polite info toast in the final stretch', async () => {
    const w = H.createWorld({});
    await w.startExam('Fin', 'fin@crc-test.local');
    /* server reports a start time ~58 minutes ago → remaining ≈ 2 minutes;
       reconcile on focus adopts the authoritative server start time */
    w.cfg.session.startTime = new Date(Date.now() - 58 * 60 * 1000).toISOString();
    w.fireWin('focus', {});
    await H.tick(2200);   // adoption + a few timer ticks
    const texts = () => w.snapshot().toasts.filter(x => /Final stretch/.test(x.text));
    assert.ok(texts().length >= 1, 'no final-stretch toast: ' + JSON.stringify(w.snapshot().toasts.map(x => x.text)));
    const found = texts()[0];
    assert.strictEqual(found.role, 'status', 'checklist not polite');
    assert.ok(found.cls.includes('crc-toast--info'), 'checklist level: ' + found.cls);
    const countBefore = texts().length;
    await H.tick(1500);   // several more ticks — must not replay
    assert.ok(texts().length <= countBefore, 'checklist replayed');
  });

  /* runtime: a clean submit ends with the success celebration */
  await t.check('F4: clean submit shows the success toast (polite, no violations on record)', async () => {
    const w = H.createWorld({});
    await w.startExam('Fin2', 'fin2@crc-test.local');
    w.bodyEl.innerText = 'Your response has been recorded';
    w.fireObserver();
    await H.tick(300);
    const s = w.snapshot();
    const success = s.toasts.find(x => x.cls.includes('crc-toast--success'));
    assert.ok(success, 'no success toast: ' + JSON.stringify(s.toasts.map(x => x.cls)));
    assert.strictEqual(success.role, 'status');
    assert.ok(/no violations on record/.test(success.text), success.text);
    assert.ok(s.toasts.some(x => /Exam submitted/.test(x.text)));
  });

  /* runtime: a submit with violations on record stays a routine info toast */
  await t.check('F5: a non-clean submit never gets the success celebration', async () => {
    const w = H.createWorld({});
    await w.startExam('Fin3', 'fin3@crc-test.local');
    w.fireDoc('keydown', H.keyEvt('F12'));
    await H.tick(1600);
    w.bodyEl.innerText = 'Your response has been recorded';
    w.fireObserver();
    await H.tick(300);
    const s = w.snapshot();
    assert.ok(!s.toasts.some(x => x.cls.includes('crc-toast--success')), 'success shown for a flagged exam');
    assert.ok(s.toasts.some(x => /violation report will be emailed/.test(x.text)), 'no routine finalize toast');
  });
};
