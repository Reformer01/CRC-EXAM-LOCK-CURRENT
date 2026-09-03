'use strict';
/* Admin UX + purge semantics (v1.1.8): plain-language result dialogs,
   destructive-action confirmation, and purges that keep audit markers so
   confirm counts always equal the rows actually deleted. */
const assert = require('assert');
const H = require('../helpers/harness');

const MARKERS = ['exam_started', 'exam_submitted', 'exam_locked', 'time_expired', 'webhook_test', 'state_recovered', 'state_tampered', 'state_migrated'];
const isActual = (type) => {
  const t = String(type || '').trim();
  return !!t && !t.endsWith('_suppressed') && MARKERS.indexOf(t) === -1;
};

function makeUi() {
  const alerts = [];
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
    alerts,
  };
  return ui;
}

const FORM = 'https://docs.google.com/forms/d/e/FAKEID/viewform';

module.exports = async function run(t) {
  const ui = makeUi();
  const b = H.createBackendSandbox({ ui });
  const S = b.data('Sessions');
  const V = b.data('Violations');
  const U = b.data('Unlocks');
  const violTypeIdx = () => V[0].indexOf('Type');
  const violSidIdx = () => V[0].indexOf('Session ID');
  const actualFor = (sid) => V.filter((r, i) => i > 0 && r[violSidIdx()] === sid && isActual(r[violTypeIdx()])).length;
  const totalViol = () => V.filter((r, i) => i > 0 && isActual(r[violTypeIdx()])).length;

  /* S1: single clear confirms with the count, keeps markers, reports plainly */
  S.push(['crc_a1', 'A1', 'a1@x.edu', FORM, '2026-01-01T00:00:00Z', '', 'Active', 4, '', 3600000]);
  V.push(['2026-01-01T00:00:00Z', 'crc_a1', 'A1', 'copy_paste', 'high', 'x']);
  V.push(['2026-01-01T00:01:00Z', 'crc_a1', 'A1', 'tab_hidden', 'high', 'x']);
  V.push(['2026-01-01T00:02:00Z', 'crc_a1', 'A1', 'exam_started', 'info', 'marker']);
  let start = ui.alerts.length;
  ui._queue([ui.Button.OK, ui.Button.OK], 'crc_a1');
  b.run('clearViolationsBySessionPrompt', []);
  await t.check('A1: single clear confirms naming the record count, reports plainly, keeps markers', () => {
    const dialogs = ui.alerts.slice(start);
    const confirm = dialogs.find(a => a.title === 'Clear violations?');
    assert.ok(confirm && confirm.detail.includes('2 violation records'), 'confirm: ' + (confirm && confirm.detail));
    const result = dialogs.find(a => a.title === 'Violations cleared');
    assert.ok(result && result.detail.includes('removed 2 records'), 'result: ' + (result && result.detail));
    assert.strictEqual(actualFor('crc_a1'), 0, 'violation rows not purged');
    assert.strictEqual(V.filter((r, i) => i > 0 && r[violSidIdx()] === 'crc_a1').length, 1, 'marker deleted');
  });

  /* S2: cancelling changes nothing */
  S.push(['crc_a2', 'A2', 'a2@x.edu', FORM, '2026-01-01T00:00:00Z', '', 'Active', 1, '', 3600000]);
  V.push(['2026-01-01T00:00:00Z', 'crc_a2', 'A2', 'window_blur', 'high', 'x']);
  const before = totalViol();
  start = ui.alerts.length;
  ui._queue([ui.Button.OK, ui.Button.CANCEL], 'crc_a2');
  b.run('clearViolationsBySessionPrompt', []);
  await t.check('A2: cancelling the confirm leaves violations untouched', () => {
    const dialogs = ui.alerts.slice(start);
    assert.strictEqual(totalViol(), before, 'rows deleted despite cancel');
    assert.ok(!dialogs.find(a => a.title === 'Violations cleared'), 'result shown despite cancel');
  });

  /* S3/S4: Clear All gated by total count, then reports plainly */
  V.push(['2026-01-01T00:03:00Z', 'crc_a2', 'A2', 'copy_paste', 'high', 'x']);
  V.push(['2026-01-01T00:04:00Z', 'crc_a1', 'A1', 'devtools_open', 'critical', 'x']);
  const total3 = totalViol();
  start = ui.alerts.length;
  ui._queue([ui.Button.CANCEL], '');
  b.run('clearAllViolations', []);
  await t.check('A3: Clear All asks with the total count and cancels safely', () => {
    const confirm = ui.alerts.slice(start).find(a => a.title === 'Clear all violations?');
    assert.ok(confirm && confirm.detail.includes(total3 + ' records'), 'confirm lacks total');
    assert.strictEqual(totalViol(), total3, 'rows deleted despite cancel');
  });
  start = ui.alerts.length;
  ui._queue([ui.Button.OK], '');
  b.run('clearAllViolations', []);
  await t.check('A4: Clear All confirm runs, reports plainly, keeps markers', () => {
    const result = ui.alerts.slice(start).find(a => a.title === 'Violations cleared');
    assert.ok(result && result.detail.includes('removed ' + total3 + ' records'), 'result: ' + JSON.stringify(result && result.detail));
    assert.strictEqual(totalViol(), 0, 'violation rows not purged after OK');
    assert.ok(V.filter((r, i) => i > 0).length > 0, 'all audit markers were purged by Clear All');
  });

  /* S5: unlock prompt reports plain language and resets the row */
  S.push(['crc_a5', 'A5', 'a5@x.edu', FORM, '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'Locked (Violations)', 4, 'max_violations', 3600000]);
  start = ui.alerts.length;
  ui._queue([ui.Button.OK], 'crc_a5');
  b.run('unlockSessionPrompt', []);
  await t.check('A5: unlock reports plain language and resets the row', () => {
    const result = ui.alerts.slice(start).find(a => a.title === 'Session unlocked');
    assert.ok(result && result.detail.includes('crc_a5') && result.detail.includes('resume'), 'result: ' + (result && result.detail));
    const row = b.rowFor('Sessions', 'Session ID', 'crc_a5');
    assert.strictEqual(row[b.headerCol('Sessions', 'Status') - 1], 'Active');
    assert.ok(U.length > 1, 'unlock not recorded');
  });

  /* S6: bulk clear (paste) confirms and reports both counts */
  S.push(['crc_a6a', 'A6a', 'a6a@x.edu', FORM, '2026-01-01T00:00:00Z', '', 'Active', 1, '', 3600000]);
  S.push(['crc_a6b', 'A6b', 'a6b@x.edu', FORM, '2026-01-01T00:00:00Z', '', 'Active', 2, '', 3600000]);
  V.push(['2026-01-01T00:05:00Z', 'crc_a6a', 'A6a', 'copy_paste', 'high', 'x']);
  V.push(['2026-01-01T00:06:00Z', 'crc_a6b', 'A6b', 'tab_hidden', 'high', 'x']);
  V.push(['2026-01-01T00:07:00Z', 'crc_a6b', 'A6b', 'copy_paste', 'high', 'x']);
  start = ui.alerts.length;
  ui._queue([ui.Button.OK, ui.Button.OK], 'crc_a6a crc_a6b');
  b.run('bulkClearViolationsByPastePrompt', []);
  await t.check('A6: bulk clear confirms, purges, and reports both counts', () => {
    const dialogs = ui.alerts.slice(start);
    const confirm = dialogs.find(a => a.title === 'Clear violations?');
    assert.ok(confirm && confirm.detail.includes('2 sessions'), 'confirm: ' + (confirm && confirm.detail));
    const result = dialogs.find(a => a.title === 'Violations cleared');
    assert.ok(result && result.detail.includes('3 records') && result.detail.includes('2 sessions'), 'result: ' + (result && result.detail));
    assert.strictEqual(actualFor('crc_a6a'), 0);
    assert.strictEqual(actualFor('crc_a6b'), 0);
  });

  /* S7: no dialog anywhere leaked raw JSON */
  await t.check('A7: no dialog uses the raw JSON "Result" pattern', () => {
    const jsonish = ui.alerts.filter(a => a.title === 'Result' || (a.detail || '').includes('{'));
    assert.strictEqual(jsonish.length, 0, 'JSON leaked: ' + JSON.stringify(jsonish.slice(0, 2)));
  });
};
