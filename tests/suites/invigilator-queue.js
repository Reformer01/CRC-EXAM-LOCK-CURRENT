'use strict';
/* Invigilator-side behavioral nudges (Review Queue): live review sheet as the
   first tab, urgency ordering + color coding, count-labeled menu, auto-open
   while anyone is locked, and one-step queue-row actions (unlock, or clear
   false positive + unlock) with plain-language confirms. */
const assert = require('assert');
const H = require('../helpers/harness');

const STALE = '#ea9999';
const LOCKED = '#f4c7c3';
const WATCH = '#fff2cc';
const CLEAR = '#d9ead3';
const FORM = 'https://docs.google.com/forms/d/e/FAKEID/viewform';

const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();

function makeUi() {
  const alerts = [];
  const menus = [];
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
    queue: [], text: '',
    _queue(btns, text) { ui.queue = btns.slice(); ui.text = text || ''; },
    alert(title, detail) { alerts.push({ title, detail }); return ui.queue.length ? ui.queue.shift() : ui.Button.OK; },
    prompt(title, detail) {
      alerts.push({ kind: 'prompt', title, detail });
      return {
        getSelectedButton: () => (ui.queue.length ? ui.queue.shift() : ui.Button.OK),
        getResponseText: () => ui.text,
      };
    },
    createMenu(title) {
      const rec = { title, items: [] };
      menus.push(rec);
      return {
        addItem(label, fn) { rec.items.push({ type: 'item', label, fn }); return this; },
        addSeparator() { rec.items.push({ type: 'sep' }); return this; },
        addSubMenu(sub) { rec.items.push({ type: 'submenu', title: sub.title, items: sub.items }); return this; },
        addToUi() { return this; },
        get title() { return rec.title; },
        get items() { return rec.items; },
      };
    },
    alerts, menus,
  };
  return ui;
}

/* Column positions in the seeded Sessions rows (header at index 0). */
const C = { name: 1, email: 2, form: 3, start: 4, end: 5, status: 6, count: 7, reason: 8, duration: 9 };
function seedSession(S, sid, over) {
  const row = ['s_' + sid, 'Student ' + sid, sid + '@x.edu', FORM,
    '2026-01-01T00:00:00Z', '', 'Active', 0, '', 3600000];
  Object.keys(over || {}).forEach(k => { if (k in C) row[C[k]] = over[k]; });
  S.push(row);
  return 's_' + sid;
}

module.exports = async function run(t) {
  const ui = makeUi();
  const b = H.createBackendSandbox({ ui });
  const S = b.data('Sessions');
  const V = b.data('Violations');
  const U = b.data('Unlocks');
  const RQ = b.sheets['Review Queue'];

  /* I1: Review Queue is the first tab with the full header */
  await t.check('I1: Review Queue is created as the first tab with its header', () => {
    assert.strictEqual(b.sheetOrder[0], 'Review Queue', 'order: ' + b.sheetOrder.join(','));
    const head = RQ._data[0];
    assert.ok(head.includes('Session ID') && head.includes('Waiting') && head.includes('Next Step'), head.join('|'));
  });

  /* I2: urgency ordering + fills: oldest locked first, stale red past 10 min */
  const stale = seedSession(S, 'stale', { end: isoAgo(20 * 60000), status: 'Locked (Violations)', count: 4, reason: 'max_violations' });
  const fresh = seedSession(S, 'fresh', { end: isoAgo(5 * 60000), status: 'Locked (Violations)', count: 4, reason: 'max_violations' });
  const watch = seedSession(S, 'watch', { status: 'Active', count: 2 });
  V.push([isoAgo(6 * 60000), stale, 'Student stale', 'copy_paste', 'high', 'Pasted into form']);
  V.push([isoAgo(2 * 60000), watch, 'Student watch', 'window_blur', 'high', 'x']);
  b.run('refreshReviewQueue_', []);
  await t.check('I2: locked rows sort longest-waiting first; stale row is the darker red', () => {
    const rows = RQ._data;
    assert.strictEqual(rows[1][0], stale, 'oldest locked first');
    assert.strictEqual(rows[2][0], fresh, 'newer locked second');
    assert.strictEqual(rows[3][0], watch, 'watch rows trail locked rows');
    assert.strictEqual(RQ._fills[2], STALE, 'stale fill');
    assert.strictEqual(RQ._fills[3], LOCKED, 'locked fill');
    assert.strictEqual(RQ._fills[4], WATCH, 'watch fill');
    assert.ok(rows[1][8] && rows[1][8].length > 0, 'waiting text present');
    assert.ok(/copy_paste/.test(rows[1][9]), 'latest flag shown');
  });

  /* I3: terminal/clean sessions are excluded; all-clear state has a message row */
  seedSession(S, 'sub', { end: isoAgo(60000), status: 'Submitted', reason: 'submitted' });
  seedSession(S, 'exp', { end: isoAgo(60000), status: 'Time Expired', reason: 'time_expired' });
  seedSession(S, 'clean', {});
  b.run('refreshReviewQueue_', []);
  await t.check('I3: Submitted/expired/clean-active sessions never appear', () => {
    const colA = RQ._data.slice(1).map(r => r[0]);
    assert.ok(!colA.includes('s_sub') && !colA.includes('s_exp') && !colA.includes('s_clean'), colA.join(','));
  });
  const ui2 = makeUi();
  const b2 = H.createBackendSandbox({ ui2 });
  b2.run('refreshReviewQueue_', []);
  await t.check('I4: empty state shows a single all-clear message row', () => {
    const rows = b2.sheets['Review Queue']._data;
    assert.strictEqual(rows.length, 2, 'header + message');
    assert.ok(/All clear/.test(rows[1][0]), rows[1][0]);
    assert.strictEqual(b2.sheets['Review Queue']._fills[2], CLEAR);
  });

  /* I5: age formatting is compact and human */
  await t.check('I5: fmtAgeHuman_ renders <1m / minutes / hours / days', () => {
    assert.strictEqual(b.run('fmtAgeHuman_', [59999]), '<1m');
    assert.strictEqual(b.run('fmtAgeHuman_', [25 * 60000]), '25m');
    assert.strictEqual(b.run('fmtAgeHuman_', [(3 * 60 + 10) * 60000]), '3h 10m');
    assert.strictEqual(b.run('fmtAgeHuman_', [(2 * 1440 + 4 * 60) * 60000]), '2d 4h');
  });

  /* I6: onOpen shows the count in the menu label, lists row actions, and
        jumps to the queue when a session is locked */
  const ui3 = makeUi();
  const b3 = H.createBackendSandbox({ ui: ui3 });
  b3.data('Sessions').push(['s_l1', 'L1', 'l1@x.edu', FORM,
    '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  b3.select('Sessions', 1); // start somewhere else, as a working admin would be
  b3.run('onOpen', []);
  await t.check('I6: onOpen labels the count, adds queue actions, and jumps to the queue', () => {
    const menu = ui3.menus[0];
    assert.strictEqual(menu.title, 'CRC Admin');
    const labels = menu.items.filter(i => i.type === 'item').map(i => i.label);
    assert.ok(labels[0].includes('Review Queue') && labels[0].includes('1 locked'), labels[0]);
    assert.ok(labels.some(l => l === 'Queue Row: Unlock Session'), labels.join('|'));
    assert.ok(labels.some(l => l === 'Queue Row: Clear False Positive & Unlock'), labels.join('|'));
    const name = b3.run('(function(){var ss=SpreadsheetApp.getActiveSpreadsheet();var a=ss.getActiveSheet();return a?a.getName():"";})', []);
    assert.strictEqual(name, 'Review Queue', 'should land on the queue');
  });

  /* I7: queue-row unlock keeps records, resets the session, refreshes */
  const ui4 = makeUi();
  const b4 = H.createBackendSandbox({ ui: ui4 });
  b4.data('Sessions').push(['s_u1', 'U1', 'u1@x.edu', FORM,
    '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  b4.data('Violations').push([isoAgo(60000), 's_u1', 'U1', 'copy_paste', 'high', 'x']);
  b4.run('refreshReviewQueue_', []);
  const rowOf = (sid) => b4.sheets['Review Queue']._data.findIndex(r => r[0] === sid);
  const start = ui4.alerts.length;
  ui4._queue([ui4.Button.OK], '');
  b4.select('Review Queue', rowOf('s_u1') + 1);
  b4.run('reviewSelectedUnlock', []);
  await t.check('I7: queue unlock confirms, resets to Active, keeps records, refreshes to a watch row', () => {
    const dialogs = ui4.alerts.slice(start);
    const confirm = dialogs.find(a => a.title === 'Unlock this session?');
    assert.ok(confirm && confirm.detail.includes('s_u1') && confirm.detail.includes('resume'), confirm && confirm.detail);
    const result = dialogs.find(a => a.title === 'Session unlocked');
    assert.ok(result && result.detail.includes('s_u1'), result && result.detail);
    const row = b4.rowFor('Sessions', 'Session ID', 's_u1');
    assert.strictEqual(row[b4.headerCol('Sessions', 'Status') - 1], 'Active');
    assert.ok(b4.data('Violations').length > 1, 'records must survive an unlock');
    const q = b4.sheets['Review Queue']._data.find(r => r[0] === 's_u1');
    assert.ok(q && q[3] === 'Active with flags', 'now a watch row, not locked');
  });

  /* I8: clear false positive + unlock purges records, unlocks, and drops it
        from the queue entirely */
  const ui5 = makeUi();
  const b5 = H.createBackendSandbox({ ui: ui5 });
  b5.data('Sessions').push(['s_f1', 'F1', 'f1@x.edu', FORM,
    '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  b5.data('Violations').push([isoAgo(60000), 's_f1', 'F1', 'copy_paste', 'high', 'x']);
  b5.data('Violations').push([isoAgo(59000), 's_f1', 'F1', 'tab_hidden', 'high', 'x']);
  b5.data('Violations').push([isoAgo(58000), 's_f1', 'F1', 'exam_started', 'info', 'marker']);
  b5.run('refreshReviewQueue_', []);
  const start5 = ui5.alerts.length;
  ui5._queue([ui5.Button.OK], '');
  b5.select('Review Queue', b5.sheets['Review Queue']._data.findIndex(r => r[0] === 's_f1') + 1);
  b5.run('reviewSelectedClearAndUnlock', []);
  await t.check('I8: clear+unlock confirm names the count; records purge, markers stay, session unlocks, queue clears it', () => {
    const dialogs = ui5.alerts.slice(start5);
    const confirm = dialogs.find(a => a.title === 'Clear false positive and unlock?');
    assert.ok(confirm && confirm.detail.includes('2 violation records'), confirm && confirm.detail);
    const result = dialogs.find(a => a.title === 'Session cleared and unlocked');
    assert.ok(result && /removed 2 violation records/i.test(result.detail), result && result.detail);
    const viol = b5.data('Violations').filter(r => r[1] === 's_f1');
    assert.strictEqual(viol.length, 1, 'marker kept, both violations purged');
    const row = b5.rowFor('Sessions', 'Session ID', 's_f1');
    assert.strictEqual(row[b5.headerCol('Sessions', 'Status') - 1], 'Active');
    assert.ok(b5.data('Unlocks').length > 1, 'unlock not audited');
    assert.ok(!b5.sheets['Review Queue']._data.some(r => r[0] === 's_f1'), 'handled row leaves the queue');
  });

  /* I9: cancelling changes nothing */
  const ui6 = makeUi();
  const b6 = H.createBackendSandbox({ ui: ui6 });
  b6.data('Sessions').push(['s_c1', 'C1', 'c1@x.edu', FORM,
    '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  b6.data('Violations').push([isoAgo(60000), 's_c1', 'C1', 'copy_paste', 'high', 'x']);
  b6.run('refreshReviewQueue_', []);
  ui6._queue([ui6.Button.CANCEL], '');
  b6.select('Review Queue', b6.sheets['Review Queue']._data.findIndex(r => r[0] === 's_c1') + 1);
  b6.run('reviewSelectedClearAndUnlock', []);
  await t.check('I9: cancelling the destructive confirm leaves the session locked', () => {
    const row = b6.rowFor('Sessions', 'Session ID', 's_c1');
    assert.strictEqual(row[b6.headerCol('Sessions', 'Status') - 1], 'Locked (Violations)');
    assert.ok(b6.data('Violations').filter(r => r[1] === 's_c1').length === 1, 'records deleted despite cancel');
    assert.ok(!ui6.alerts.some(a => a.title === 'Session cleared and unlocked'), 'result shown despite cancel');
  });

  /* I10: guards — non-locked sessions and wrong tab/header selections */
  const ui7 = makeUi();
  const b7 = H.createBackendSandbox({ ui: ui7 });
  b7.data('Sessions').push(['s_w1', 'W1', 'w1@x.edu', FORM,
    '2026-01-01T00:00:00Z', '', 'Active', 2, '', 3600000]);
  b7.run('refreshReviewQueue_', []);
  b7.select('Review Queue', b7.sheets['Review Queue']._data.findIndex(r => r[0] === 's_w1') + 1);
  const before = b7.data('Unlocks').length;
  b7.run('reviewSelectedUnlock', []);
  b7.run('reviewSelectedClearAndUnlock', []);
  await t.check('I10: active sessions get guidance, never a silent unlock or clear', () => {
    const msgs = ui7.alerts.filter(a => a.title === 'Nothing to unlock' || a.title === 'Nothing to clear');
    assert.strictEqual(msgs.length, 2, 'two guard messages');
    assert.strictEqual(b7.data('Unlocks').length, before, 'unlock written for an active session');
  });
  const ui8 = makeUi();
  const b8 = H.createBackendSandbox({ ui: ui8 });
  b8.select('Sessions', 2);
  b8.run('reviewSelectedUnlock', []);
  b8.select('Review Queue', 1);
  b8.run('reviewSelectedUnlock', []);
  await t.check('I11: selecting the wrong tab or the header row explains what to do', () => {
    const first = ui8.alerts.find(a => a.title === 'Select a queue row first');
    const second = ui8.alerts.find(a => a.title === 'Select a session row');
    assert.ok(first && /Review Queue/.test(first.detail), first && first.detail);
    assert.ok(second && /header/.test(second.detail), second && second.detail);
  });

  /* I12: capacity-safe rewrites — a refresh that needs more rows than the
         current trimmed sheet still lands every row */
  const ui9 = makeUi();
  const b9 = H.createBackendSandbox({ ui: ui9 });
  for (let i = 0; i < 3; i++) {
    b9.data('Sessions').push(['s_g' + i, 'G' + i, 'g' + i + '@x.edu', FORM,
      '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  }
  b9.run('refreshReviewQueue_', []);
  for (let i = 3; i < 40; i++) {
    b9.data('Sessions').push(['s_g' + i, 'G' + i, 'g' + i + '@x.edu', FORM,
      '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  }
  b9.run('refreshReviewQueue_', []);
  await t.check('I12: queue rewrites stay capacity-safe when the set grows', () => {
    const rows = b9.sheets['Review Queue']._data;
    assert.strictEqual(rows.length, 41, 'header + 40 locked rows');
    assert.strictEqual(rows[40][0], 's_g39');
    assert.ok(b9.sheets['Review Queue'].getMaxRows() >= rows.length, 'rows exceed capacity');
  });

  /* I14: queue-row grant time extends a running (watch) session with confirm */
  const ui11 = makeUi();
  const b11 = H.createBackendSandbox({ ui: ui11 });
  seedSession(b11.data('Sessions'), 't1', { status: 'Active', count: 2 });
  b11.run('refreshReviewQueue_', []);
  const start11 = ui11.alerts.length;
  ui11._queue([ui11.Button.OK, ui11.Button.OK], ['15']);
  b11.select('Review Queue', b11.sheets['Review Queue']._data.findIndex(r => r[0] === 's_t1') + 1);
  b11.run('reviewSelectedGrantTime', []);
  await t.check('I14: queue-row grant confirms the minutes and extends the running exam', () => {
    const dialogs = ui11.alerts.slice(start11);
    const confirm = dialogs.find(a => a.title === 'Add time to this exam?');
    assert.ok(confirm && confirm.detail.includes('15 minutes') && confirm.detail.includes('s_t1'), confirm && confirm.detail);
    const result = dialogs.find(a => a.title === 'Time granted');
    assert.ok(result && result.detail.includes('Added 15 minutes to 1 active session'), result && result.detail);
    const row = b11.rowFor('Sessions', 'Session ID', 's_t1');
    assert.strictEqual(row[b11.headerCol('Sessions', 'Duration (ms)') - 1], 3600000 + 15 * 60000);
    assert.strictEqual(row[b11.headerCol('Sessions', 'Extension (ms)') - 1], 15 * 60000);
  });

  /* I15: the queue-row grant refuses locked rows */
  seedSession(b11.data('Sessions'), 't2', { status: 'Locked (Violations)', count: 4, reason: 'max_violations' });
  b11.run('refreshReviewQueue_', []);
  const beforeT2 = b11.rowFor('Sessions', 'Session ID', 's_t2')[b11.headerCol('Sessions', 'Duration (ms)') - 1];
  const start15 = ui11.alerts.length;
  b11.select('Review Queue', b11.sheets['Review Queue']._data.findIndex(r => r[0] === 's_t2') + 1);
  b11.run('reviewSelectedGrantTime', []);
  await t.check('I15: queue-row grant blocks locked sessions without mutation', () => {
    const guard = ui11.alerts.slice(start15).find(a => a.title === 'Not a running exam');
    assert.ok(guard, 'guard missing');
    assert.strictEqual(b11.rowFor('Sessions', 'Session ID', 's_t2')[b11.headerCol('Sessions', 'Duration (ms)') - 1], beforeT2);
  });

  /* I13: clear-all flow leaves the queue current (locked sessions still listed
         for unlock, count zeroed) */
  const ui10 = makeUi();
  const b10 = H.createBackendSandbox({ ui: ui10 });
  b10.data('Sessions').push(['s_x1', 'X1', 'x1@x.edu', FORM,
    '2026-01-01T00:00:00Z', isoAgo(60000), 'Locked (Violations)', 4, 'max_violations', 3600000]);
  b10.data('Violations').push([isoAgo(60000), 's_x1', 'X1', 'copy_paste', 'high', 'x']);
  ui10._queue([ui10.Button.OK], '');
  b10.run('clearAllViolations', []);
  await t.check('I13: after Clear All the queue still surfaces the locked session with a zeroed count', () => {
    const q = b10.sheets['Review Queue']._data.find(r => r[0] === 's_x1');
    assert.ok(q, 'locked session must remain visible for unlocking');
    assert.strictEqual(q[4], 0, 'count zeroed by the clear');
    assert.strictEqual(q[3], 'Locked (Violations)');
  });

  /* I16: the Time Left column lets invigilators size grants — real-clock
         remaining for running and locked sessions, Expired past the end */
  const ui12 = makeUi();
  const b12 = H.createBackendSandbox({ ui: ui12 });
  const Q = b12.sheets['Review Queue'];
  seedSession(b12.data('Sessions'), 'run', { start: isoAgo(10 * 60000), dur: 3600000, status: 'Active', count: 1 });
  seedSession(b12.data('Sessions'), 'lock', { start: isoAgo(40 * 60000), end: isoAgo(20 * 60000), dur: 3600000, status: 'Locked (Violations)', count: 4, reason: 'max_violations' });
  seedSession(b12.data('Sessions'), 'gone', { start: isoAgo(2 * 3600000), end: isoAgo(20 * 60000), dur: 3600000, status: 'Locked (Violations)', count: 4, reason: 'max_violations' });
  b12.run('refreshReviewQueue_', []);
  await t.check('I16: Time Left shows remaining clock for running and locked rows, Expired past the end', () => {
    assert.ok(Q._data[0].includes('Time Left'), 'header: ' + Q._data[0].join('|'));
    const row = (sid) => Q._data.find(r => r[0] === sid);
    assert.ok(/^(4[89]|50)m$/.test(row('s_run')[5]), 'running left: ' + row('s_run')[5]);
    assert.ok(/^(1[89]|20)m$/.test(row('s_lock')[5]), 'locked left should track the real clock: ' + row('s_lock')[5]);
    assert.strictEqual(row('s_gone')[5], 'Expired', 'past-duration row not marked Expired');
    assert.ok(row('s_run')[3] === 'Active with flags' && row('s_run')[4] === 1, 'watch row shape changed');
  });

  /* I17: quick-preset grants (+5/+10/+15/+30) apply with one click — no
        minutes prompt, no confirm — extending the running session each time */
  const ui14 = makeUi();
  const b14 = H.createBackendSandbox({ ui: ui14 });
  const PRESETS = [5, 10, 15, 30];
  PRESETS.forEach(m => seedSession(b14.data('Sessions'), 'pre' + m, { status: 'Active', count: 1 }));
  b14.run('refreshReviewQueue_', []);
  const start17 = ui14.alerts.length;
  PRESETS.forEach(m => {
    const sid = 's_pre' + m;
    b14.select('Review Queue', b14.sheets['Review Queue']._data.findIndex(r => r[0] === sid) + 1);
    b14.run('reviewSelectedGrantPlus' + m, []);
  });
  await t.check('I17: presets +5/+10/+15/+30 grant in one click with no prompt or confirm', () => {
    const dialogs = ui14.alerts.slice(start17);
    assert.strictEqual(dialogs.filter(d => d.kind === 'prompt').length, 0, 'presets must not prompt for minutes');
    assert.strictEqual(dialogs.filter(d => d.title === 'Add time to this exam?').length, 0, 'presets must not confirm');
    PRESETS.forEach(m => {
      const row = b14.rowFor('Sessions', 'Session ID', 's_pre' + m);
      assert.strictEqual(row[b14.headerCol('Sessions', 'Duration (ms)') - 1], 3600000 + m * 60000, '+' + m + ' duration');
      assert.strictEqual(row[b14.headerCol('Sessions', 'Extension (ms)') - 1], m * 60000, '+' + m + ' extension');
    });
    const results = dialogs.filter(d => d.title === 'Time granted');
    assert.strictEqual(results.length, 4, 'one result per preset');
    assert.ok(results.some(d => d.detail.includes('Added 30 minutes to 1 active session')), results.map(d => d.detail).join(' | '));
    PRESETS.forEach(m => {
      const audit = b14.debug.find(d => d[1] === 'admin_action' && d[2].includes('grant_time') && d[2].includes('+' + m + ' min preset'));
      assert.ok(audit, '+' + m + ' preset not audited');
    });
  });

  /* I18: a preset on a locked row is refused with zero mutation */
  seedSession(b14.data('Sessions'), 'plock', { status: 'Locked (Violations)', count: 4, reason: 'max_violations', end: isoAgo(60000) });
  b14.run('refreshReviewQueue_', []);
  const start18 = ui14.alerts.length;
  b14.select('Review Queue', b14.sheets['Review Queue']._data.findIndex(r => r[0] === 's_plock') + 1);
  b14.run('reviewSelectedGrantPlus30', []);
  await t.check('I18: a preset on a locked row shows the guard and changes nothing', () => {
    const guard = ui14.alerts.slice(start18).find(a => a.title === 'Not a running exam');
    assert.ok(guard && guard.detail.includes('s_plock'), 'guard missing: ' + JSON.stringify(ui14.alerts.slice(start18)));
    const row = b14.rowFor('Sessions', 'Session ID', 's_plock');
    assert.strictEqual(row[b14.headerCol('Sessions', 'Duration (ms)') - 1], 3600000, 'locked duration mutated');
    assert.strictEqual(row[b14.headerCol('Sessions', 'Extension (ms)') - 1], undefined, 'locked extension mutated');
  });

  /* I19: the Grant Time submenu wires all four presets plus the custom flow */
  const ui15 = makeUi();
  const b15 = H.createBackendSandbox({ ui: ui15 });
  b15.run('onOpen', []);
  await t.check('I19: the menu nests the four preset grants under Queue Row: Grant Time', () => {
    const root = ui15.menus.find(m => m.title === 'CRC Admin');
    assert.ok(root, 'no admin menu');
    const sub = root.items.find(i => i.type === 'submenu' && i.title === 'Queue Row: Grant Time');
    assert.ok(sub, 'submenu missing: ' + JSON.stringify(root.items));
    const items = sub.items.filter(i => i.type === 'item');
    assert.deepStrictEqual(items.map(i => i.label),
      ['+5 minutes', '+10 minutes', '+15 minutes', '+30 minutes', 'Custom minutes…'], items.map(i => i.label).join('|'));
    assert.deepStrictEqual(items.map(i => i.fn),
      ['reviewSelectedGrantPlus5', 'reviewSelectedGrantPlus10', 'reviewSelectedGrantPlus15', 'reviewSelectedGrantPlus30', 'reviewSelectedGrantTime']);
  });

  /* I20: the Granted chip shows cumulative extensions (+N) per session,
        right next to Time Left, and stays blank for sessions with none */
  const ui16 = makeUi();
  const b16 = H.createBackendSandbox({ ui: ui16 });
  const Q16 = b16.sheets['Review Queue'];
  const setExt = (sid, ms) => {
    const row = b16.rowFor('Sessions', 'Session ID', sid);
    row[b16.headerCol('Sessions', 'Extension (ms)') - 1] = ms;
  };
  seedSession(b16.data('Sessions'), 'g1', { status: 'Active', count: 1 });
  seedSession(b16.data('Sessions'), 'g2', { status: 'Locked (Violations)', count: 4, reason: 'max_violations', end: isoAgo(60000) });
  seedSession(b16.data('Sessions'), 'g3', { status: 'Active', count: 1 });
  setExt('s_g1', 15 * 60000);
  setExt('s_g2', 75 * 60000); // two earlier grants accumulated
  b16.run('refreshReviewQueue_', []);
  await t.check('I20: Granted shows a +N chip for extended sessions and stays blank otherwise', () => {
    assert.strictEqual(Q16._data[0][6], 'Granted', 'header: ' + Q16._data[0].join('|'));
    const row = (sid) => Q16._data.find(r => r[0] === sid);
    assert.strictEqual(row('s_g1')[6], '+15m', 'single grant: ' + row('s_g1')[6]);
    assert.strictEqual(row('s_g2')[6], '+1h 15m', 'cumulative grants: ' + row('s_g2')[6]);
    assert.strictEqual(row('s_g3')[6], '', 'no grant must stay blank');
  });
};
