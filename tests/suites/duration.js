'use strict';
/* Bulk exam-duration change (v1.1.7): backend set-exam-duration flow plus
   client adoption (dropdown default, mid-exam reconcile, reconcile-on-return). */
const assert = require('assert');
const H = require('../helpers/harness');

module.exports = async function run(t) {
  /* ---------------- backend ---------------- */
  const b = H.createBackendSandbox();
  const S = b.data('Sessions');
  const base = new Date(Date.now() - 60000).toISOString();
  const FORM = 'https://docs.google.com/forms/d/e/FAKEID/viewform';
  S.push(['crc_active_1', 'N1', 'n1@x.edu', FORM, base, '', 'Active', 0, '', 3600000]);
  S.push(['crc_active_2', 'N2', 'n2@x.edu', FORM, base, '', 'Active', 0, '', 3600000]);
  S.push(['crc_locked_1', 'N3', 'n3@x.edu', FORM, base, '2026-01-01T00:00:00Z', 'Locked (Violations)', 4, 'max_violations', 3600000]);
  S.push(['crc_other_1', 'N4', 'n4@x.edu', 'https://docs.google.com/forms/d/e/OTHERID/viewform', base, '', 'Active', 0, '', 3600000]);

  const run = (fn, args) => b.run(fn, args);
  const EX = b.data('Exams');
  const DUR = H.FORM_ID === H.FORM_ID ? 10 : 0; // col position helper unused below

  let r = run('setExamDurationForForm', ['FAKEID', FORM, 5400000]);
  await t.check('D1: set duration writes the Exams default and updates Active sessions only', () => {
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.updated, 2, 'updated ' + r.updated);
    assert.strictEqual(EX.length, 2, 'Exams row not created');
    assert.strictEqual(EX[1][0], 'FAKEID');
    assert.strictEqual(EX[1][2], 5400000);
    assert.strictEqual(S[1][9], 5400000, 'active 1 not updated');
    assert.strictEqual(S[2][9], 5400000, 'active 2 not updated');
    assert.strictEqual(S[3][9], 3600000, 'locked session touched');
    assert.strictEqual(S[4][9], 3600000, 'other-form session touched');
  });
  await t.check('D2: the action is audit-logged with the actor', () => {
    assert.ok(b.debug.some(d => d[1] === 'admin_action' && d[2].includes('set_exam_duration') && d[2].includes('admin@crc.edu')));
  });

  r = run('setExamDurationForForm', ['FAKEID', FORM, 3600000]);
  await t.check('D3: re-setting upserts the Exams row instead of duplicating it', () => {
    assert.strictEqual(r.updated, 2);
    assert.strictEqual(EX.length, 2, 'Exams row duplicated');
    assert.strictEqual(EX[1][2], 3600000);
    assert.strictEqual(S[1][9], 3600000);
  });

  await t.check('D4: bare form ID input matches the same sessions', () => {
    const rr = run('setExamDurationForForm', ['FAKEID', '', 4500000]);
    assert.strictEqual(rr.updated, 2);
    assert.strictEqual(S[1][9], 4500000);
    assert.strictEqual(EX[1][2], 4500000);
  });

  await t.check('D5: duration validation (10 min to 8 h)', () => {
    assert.strictEqual(run('setExamDurationForForm', ['FAKEID', '', 5 * 60000]).ok, false);
    assert.strictEqual(run('setExamDurationForForm', ['FAKEID', '', 9 * 60 * 60000]).ok, false);
    assert.strictEqual(run('setExamDurationForForm', ['', '', 3600000]).error, 'missing_formId');
  });

  await t.check('D6: getExamDefault_ reads the stored default', () => {
    assert.strictEqual(run('getExamDefault_', ['FAKEID']), 4500000);
    assert.strictEqual(run('getExamDefault_', ['NOPE']), null);
  });

  await t.check('D7: countActiveSessionsForForm_ counts only Active rows of that form', () => {
    assert.strictEqual(run('countActiveSessionsForForm_', ['FAKEID']), 2);
    assert.strictEqual(run('countActiveSessionsForForm_', ['OTHERID']), 1);
    assert.strictEqual(run('countActiveSessionsForForm_', ['NOPE']), 0);
  });

  await t.check('D8: exam_default GET action returns the default for the form', () => {
    const out = b.run('doGet', [{ parameter: { action: 'exam_default', formUrl: FORM } }]);
    const body = JSON.parse(out.getContent());
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.found, true);
    assert.strictEqual(body.durationMs, 4500000);
    const miss = b.run('doGet', [{ parameter: { action: 'exam_default', formUrl: 'https://docs.google.com/forms/d/e/NOPE/viewform' } }]);
    assert.strictEqual(JSON.parse(miss.getContent()).found, false);
  });

  /* ---------------- client ---------------- */
  await t.check('C1: setup pre-selects the exam default with a labeled option', async () => {
    const w = H.createWorld({ examDefault: { ok: true, found: true, durationMs: 5400000 } });
    await H.tick(150);
    const select = w.overlays()[0].querySelector('#crc-duration-input');
    assert.strictEqual(select.value, '5400000', 'not pre-selected: ' + select.value);
    assert.ok(select.children.some(c => c.value === '5400000' && c.textContent.includes('exam default')), 'no labeled option');
  });

  await t.check('C2: without a server default the dropdown is untouched', async () => {
    const w = H.createWorld({});
    await H.tick(150);
    const select2 = w.overlays()[0].querySelector('#crc-duration-input');
    assert.ok(!select2.children.some(c => c.textContent.includes('exam default')), 'option added without default');
  });

  await t.check('C3: mid-exam duration change is adopted with a toast', async () => {
    const w = H.createWorld({});
    await w.startExam('C3', 'c3@crc-test.local');
    const before = w.fetchCounts.session_status;
    w.cfg.session.durationMs = 4500000;   // admin extended the exam
    w.fireWin('focus', {});
    await H.tick(200);
    const live = await w.liveStatus();
    assert.ok(w.fetchCounts.session_status > before, 'reconcile did not run on focus');
    assert.ok(live && live.remainingMs > 4000000, 'duration not adopted: ' + JSON.stringify(live));
    assert.ok(w.snapshot().toasts.some(t => t.text.includes('updated to 75 minutes')), 'no toast');
  });

  await t.check('C4: an unchanged duration never toasts', async () => {
    const w = H.createWorld({});
    await w.startExam('C4', 'c4@crc-test.local');
    w.fireWin('focus', {});
    await H.tick(200);
    assert.ok(!w.snapshot().toasts.some(t => t.text.includes('updated to')), 'toast on no change');
  });

  await t.check('C5: visibility restore triggers a reconcile', async () => {
    const w = H.createWorld({});
    await w.startExam('C5', 'c5@crc-test.local');
    const v = w.fetchCounts.session_status;
    w.fireDoc('visibilitychange', {});
    await H.tick(150);
    assert.ok(w.fetchCounts.session_status > v, 'no reconcile on visibility');
  });
};
