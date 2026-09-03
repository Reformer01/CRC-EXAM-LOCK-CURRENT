'use strict';
/* Mid-exam time grants for invigilators: add minutes to running sessions
   (single, bulk paste, whole exam by form), never touching locked /
   submitted / expired rows or future-start defaults; the Extension (ms)
   column tracks accumulated grants; the student client adopts the raised
   Duration (ms) on its next reconcile and toasts it. */
const assert = require('assert');
const H = require('../helpers/harness');

const FORM = 'https://docs.google.com/forms/d/e/FAKEID/viewform';
const OTHER = 'https://docs.google.com/forms/d/e/OTHERID/viewform';
const HOUR = 3600000;
const STATUS = 6, DUR = 9, EXT = 10; // 0-based indexes into seeded Sessions rows

function makeUi() {
  const alerts = [];
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
    queue: [], texts: [], text: '',
    _queue(btns, texts) { ui.queue = btns.slice(); ui.texts = (texts || []).slice(); },
    alert(title, detail) { alerts.push({ title, detail }); return ui.queue.length ? ui.queue.shift() : ui.Button.OK; },
    prompt(title, detail) {
      alerts.push({ kind: 'prompt', title, detail });
      return {
        getSelectedButton: () => (ui.queue.length ? ui.queue.shift() : ui.Button.OK),
        getResponseText: () => (ui.texts.length ? ui.texts.shift() : ui.text),
      };
    },
    alerts,
  };
  return ui;
}

function seed(S, sid, over) {
  const row = ['s_' + sid, 'S' + sid, sid + '@x.edu', FORM,
    '2026-01-01T00:00:00Z', '', 'Active', 0, '', 3600000, 0];
  Object.keys(over || {}).forEach(k => {
    if (k === 'status') row[STATUS] = over[k];
    else if (k === 'dur') row[DUR] = over[k];
    else if (k === 'ext') row[EXT] = over[k];
    else if (k === 'form') row[3] = over[k];
  });
  S.push(row);
  return 's_' + sid;
}

module.exports = async function run(t) {
  const ui = makeUi();
  const b = H.createBackendSandbox({ ui });
  const S = b.data('Sessions');

  /* G1: Sessions sheet has the audit column and grants accumulate it */
  await t.check('G1: Sessions sheet gains the Extension (ms) column', () => {
    assert.ok(S[0].includes('Extension (ms)'), 'header: ' + S[0].join('|'));
  });

  const g1 = seed(S, 'g1');
  const g2 = seed(S, 'g2');
  seed(S, 'l1', { status: 'Locked (Violations)' });
  seed(S, 's1', { status: 'Submitted' });
  seed(S, 'e1', { status: 'Time Expired' });
  const r = b.run('grantTimeToSessions', [['s_g1', 's_g2', 's_l1', 's_s1', 's_e1', 's_missing'], 15, 'test']);
  await t.check('G2: grants only Active sessions; locked/submitted/expired skipped; missing reported', () => {
    assert.strictEqual(r.updated, 2);
    assert.strictEqual(r.skipped, 3);
    assert.strictEqual(r.missing, 1);
    const a = b.rowFor('Sessions', 'Session ID', 's_g1');
    const bRow = b.rowFor('Sessions', 'Session ID', 's_g2');
    assert.strictEqual(a[DUR], 3600000 + 15 * 60000);
    assert.strictEqual(a[EXT], 15 * 60000);
    assert.strictEqual(bRow[DUR], 3600000 + 15 * 60000);
    for (const sid of ['s_l1', 's_s1', 's_e1']) {
      const row = b.rowFor('Sessions', 'Session ID', sid);
      assert.strictEqual(row[DUR], 3600000, sid + ' duration changed');
      assert.ok(row[STATUS] !== 'Active', sid + ' status untouched');
    }
  });

  b.run('grantTimeToSessions', [['s_g1'], 10, 'test']);
  await t.check('G3: repeated grants accumulate in the Extension column', () => {
    const row = b.rowFor('Sessions', 'Session ID', 's_g1');
    assert.strictEqual(row[DUR], 3600000 + 25 * 60000);
    assert.strictEqual(row[EXT], 25 * 60000);
  });

  seed(S, 'cap', { dur: 8 * HOUR - 30 * 60000 });
  const capR = b.run('grantTimeToSessions', [['s_cap'], 60, 'test']);
  await t.check('G4: total duration is capped at the 8 h client maximum; real delta audited', () => {
    const row = b.rowFor('Sessions', 'Session ID', 's_cap');
    assert.strictEqual(row[DUR], 8 * HOUR);
    assert.strictEqual(row[EXT], 30 * 60000, 'only the actually-granted delta recorded');
    assert.strictEqual(capR.updated, 1);
  });

  const badBefore = b.rowFor('Sessions', 'Session ID', 's_g2')[DUR];
  const bad1 = b.run('grantTimeToSessions', [['s_g2'], 0, 'test']);
  const bad2 = b.run('grantTimeToSessions', [['s_g2'], 361, 'test']);
  const bad3 = b.run('grantTimeToSessions', [['s_g2'], 'abc', 'test']);
  const bad4 = b.run('grantTimeToSessions', [['s_g2'], -5, 'test']);
  await t.check('G5: invalid minute values are rejected with nothing written', () => {
    for (const rBad of [bad1, bad2, bad3, bad4]) {
      assert.strictEqual(rBad.ok, false);
      assert.strictEqual(rBad.error, 'invalid_minutes');
    }
    assert.strictEqual(b.rowFor('Sessions', 'Session ID', 's_g2')[DUR], badBefore);
  });

  /* G6: single-session flow — prompt, guard on non-active, confirm, result */
  const ui6 = makeUi();
  const b6 = H.createBackendSandbox({ ui: ui6 });
  seed(b6.data('Sessions'), 'one');
  const start6 = ui6.alerts.length;
  ui6._queue([ui6.Button.OK, ui6.Button.OK, ui6.Button.OK], ['s_one', '15']);
  b6.run('grantTimeToSessionPrompt', []);
  await t.check('G6: single grant confirms with the session and reports plain language', () => {
    const dialogs = ui6.alerts.slice(start6);
    const confirm = dialogs.find(a => a.title === 'Add time to this exam?');
    assert.ok(confirm && confirm.detail.includes('15 minutes') && confirm.detail.includes('s_one'), confirm && confirm.detail);
    const result = dialogs.find(a => a.title === 'Time granted');
    assert.ok(result && result.detail.includes('Added 15 minutes to 1 active session'), result && result.detail);
    const row = b6.rowFor('Sessions', 'Session ID', 's_one');
    assert.strictEqual(row[DUR], 3600000 + 15 * 60000);
  });

  const ui7 = makeUi();
  const b7 = H.createBackendSandbox({ ui: ui7 });
  seed(b7.data('Sessions'), 'locked', { status: 'Locked (Violations)' });
  const before7 = b7.rowFor('Sessions', 'Session ID', 's_locked')[DUR];
  const start7 = ui7.alerts.length;
  ui7._queue([ui7.Button.OK], ['s_locked']);
  b7.run('grantTimeToSessionPrompt', []);
  await t.check('G7: single flow blocks a non-active session without mutation', () => {
    const guard = ui7.alerts.slice(start7).find(a => a.title === 'Not a running exam');
    assert.ok(guard, 'guard missing');
    assert.strictEqual(b7.rowFor('Sessions', 'Session ID', 's_locked')[DUR], before7);
  });

  /* G8: whole-exam grant by form URL hits only that exam's active students */
  const ui8 = makeUi();
  const b8 = H.createBackendSandbox({ ui: ui8 });
  seed(b8.data('Sessions'), 'fA');
  seed(b8.data('Sessions'), 'fB');
  seed(b8.data('Sessions'), 'oA', { form: OTHER });
  seed(b8.data('Sessions'), 'fLock', { status: 'Locked (Violations)' });
  const start8 = ui8.alerts.length;
  ui8._queue([ui8.Button.OK, ui8.Button.OK, ui8.Button.OK], [FORM, '15']);
  b8.run('grantTimeByFormPrompt', []);
  await t.check('G8: form grant confirms the student count and only touches active students of that exam', () => {
    const dialogs = ui8.alerts.slice(start8);
    const confirm = dialogs.find(a => a.title === 'Add time to this whole exam?');
    assert.ok(confirm && confirm.detail.includes('2 students'), confirm && confirm.detail);
    const result = dialogs.find(a => a.title === 'Time granted');
    assert.ok(result && result.detail.includes('Added 15 minutes to 2 active sessions'), result && result.detail);
    assert.strictEqual(b8.rowFor('Sessions', 'Session ID', 's_fA')[DUR], 3600000 + 15 * 60000);
    assert.strictEqual(b8.rowFor('Sessions', 'Session ID', 's_fB')[DUR], 3600000 + 15 * 60000);
    assert.strictEqual(b8.rowFor('Sessions', 'Session ID', 's_oA')[DUR], 3600000, 'other exam touched');
    assert.strictEqual(b8.rowFor('Sessions', 'Session ID', 's_fLock')[DUR], 3600000, 'locked student touched');
  });

  /* G9: audit entry records the grant */
  await t.check('G9: grants are audited to DebugLog with actor and counts', () => {
    const entry = b.debug.map(e => e[1]).indexOf('admin_action');
    assert.ok(entry !== -1, 'no admin_action audit entry');
    const details = JSON.parse(b.debug[entry][2]);
    assert.strictEqual(details.action, 'grant_time');
    assert.strictEqual(details.minutes, 15);
    assert.strictEqual(details.requested, 6);
    assert.strictEqual(details.updated, 2);
    assert.strictEqual(details.actor, 'admin@crc.edu');
  });

  /* G10: the student client adopts a grant and toasts the new time */
  await t.check('G10: a grant raises the client timer within one reconcile with a toast', async () => {
    const w = H.createWorld({});
    await w.startExam('G10', 'g10@crc-test.local');
    const before = await w.liveStatus();
    w.cfg.session.durationMs = Number(w.cfg.session.durationMs) + 15 * 60000; // invigilator granted +15m
    w.fireWin('focus', {});
    await H.tick(200);
    const live = await w.liveStatus();
    assert.ok(live.remainingMs > (before.remainingMs + 13 * 60000),
      'timer did not extend: ' + before.remainingMs + ' -> ' + live.remainingMs);
    assert.ok(w.snapshot().toasts.some(t => t.text.includes('updated to 75 minutes')), 'no adoption toast');
  });
};