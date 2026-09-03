'use strict';
/* THE core regression suite (v1.1.1–v1.1.5 semantics):
   - submission can never be lost or blocked by a violation
   - server state is authoritative (lock / unlock / submit / count)
   - backend first-finalize-wins (no clobbered locks, no double emails)

   If these break, students lose exams — treat failures here as P0. */
const assert = require('assert');
const H = require('../helpers/harness');

const F12 = H.keyEvt('F12');

/* Capture a REAL stored-state JSON produced by content.js (always passes
   its own integrity rules), optionally mutated by `over`. */
async function capturedState(over) {
  const w0 = H.createWorld({});
  await w0.startExam('Seed', 'seed@crc-test.local');
  const key = 'crcSession_' + H.FORM_ID;
  const st = JSON.parse(w0.storageData[key]);
  Object.assign(st, over || {});
  return { [key]: JSON.stringify(st) };
}

function serverSession(over) {
  return Object.assign({
    sessionId: 'crc_srv_1', unlocked: false, clearedAt: '',
    startTime: new Date(Date.now() - 60000).toISOString(),
    violationCount: 0, status: 'Active', durationMs: 3600000,
  }, over);
}

module.exports = async function run(t) {
  /* ================= SUBMISSION FAILSAFE ================= */

  await t.check('S1: a late form confirmation finalizes a locked exam (never lost in transit)', async () => {
    const w = H.createWorld({});
    await w.startExam('S1', 's1@crc-test.local');
    for (let i = 0; i < 4; i++) { w.fireDoc('keydown', F12); await H.tick(1600); }
    assert.ok(w.snapshot().overlay, 'not locked');
    /* Google's confirmation arrives after the lockout */
    w.bodyEl.innerText = 'Your response has been recorded';
    w.fireObserver();
    await H.tick(250);
    const live = await w.liveStatus();
    const reasons = w.sentMsgs.filter(m => m.type === 'END_SESSION').map(m => m.reason);
    assert.strictEqual(live.isSubmitted, true, 'not finalized');
    assert.ok(reasons.includes('submitted'), 'no submitted END_SESSION: ' + JSON.stringify(reasons));
  });

  await t.check('S2: violations never record during submit, and a failed submit releases the pending flag', async () => {
    const w = H.createWorld({});
    await w.startExam('S2', 's2@crc-test.local');
    /* real form submit event (Google validation may keep the page alive) */
    for (const fn of (w.formStub.listeners.submit || [])) fn({});
    await H.tick(50);
    w.fireDoc('keydown', F12);                 // during pendingSubmit
    await H.tick(200);
    assert.ok(w.snapshot().badgeText.includes('0 of 4'), 'violation recorded during submit');
    /* no confirmation arrived → pending flag must be released, no false finalize */
    await H.tick(3100);
    assert.ok(!w.sentMsgs.some(m => m.type === 'END_SESSION' && m.reason === 'submitted'), 'false submitted finalize');
    w.fireDoc('keydown', F12);                 // tracking resumes
    await H.tick(1600);
    assert.ok(w.snapshot().badgeText.includes('1 of 4'), 'tracking did not resume');
  });

  await t.check('S3: genuine submit with confirmation still finalizes after the grace window', async () => {
    const w = H.createWorld({});
    await w.startExam('S3', 's3@crc-test.local');
    for (const fn of (w.formStub.listeners.submit || [])) fn({});
    w.bodyEl.innerText = 'Your answer has been recorded';
    w.fireObserver();
    await H.tick(250);
    const live = await w.liveStatus();
    assert.strictEqual(live.isSubmitted, true);
    assert.ok(w.sentMsgs.some(m => m.type === 'END_SESSION' && m.reason === 'submitted'));
  });

  /* ================= HARDENING: SERVER AUTHORITY ================= */

  await t.check('H1: server lock enforced on resume when the count is at max (END_SESSION lost in transit)', async () => {
    /* local state is clean at 0; the server row already has 4 violations */
    const seed = await capturedState();
    const w = H.createWorld({
      session: serverSession({ violationCount: 4, status: 'Active' }),
    }, seed);
    await H.tick(600);
    const s = w.snapshot();
    assert.ok(s.overlay, 'server lock not enforced: ' + JSON.stringify(s.overlay));
    assert.ok(!s.timerPresent, 'timer survived lockout');
    const live = await w.liveStatus();
    assert.strictEqual(live.isLocked, true);
  });

  await t.check('H2: an admin unlock on the server clears a reconcile-enforced lock without reload', async () => {
    const seed = await capturedState();
    const w = H.createWorld({
      session: serverSession({ violationCount: 4, status: 'Locked (Violations)' }),
    }, seed);
    await H.tick(600);
    assert.ok(w.snapshot().overlay, 'not locked by server status');
    /* invigilator unlocks server-side; polling should adopt it */
    w.cfg.session.unlocked = true;
    w.cfg.session.clearedAt = new Date().toISOString();
    w.cfg.session.violationCount = 0;
    w.cfg.session.status = 'Active';
    let resumed = false;
    for (let i = 0; i < 40 && !resumed; i++) { await H.tick(500); resumed = !w.snapshot().overlay; }
    const s = w.snapshot();
    assert.ok(resumed, 'still locked after server unlock');
    assert.ok(s.badgeText && s.badgeText.includes('0 of 4'), 'badge not reset: ' + s.badgeText);
    assert.ok(s.timerPresent, 'timer missing after resume');
  });

  await t.check('H3: a Submitted status always wins over a high violation count', async () => {
    const seed = await capturedState();
    const w = H.createWorld({
      session: serverSession({ violationCount: 4, status: 'Submitted' }),
    }, seed);
    await H.tick(600);
    const s = w.snapshot();
    assert.ok(!s.overlay, 'relocked a submitted exam');
    const live = await w.liveStatus();
    assert.strictEqual(live.isSubmitted, true, 'not finalized as submitted');
  });

  await t.check('H4: tampered local state without a server match locks with an integrity message', async () => {
    const seed = await capturedState({ _sig: 'tampered' });
    const w = H.createWorld({}, seed);   // server knows nothing about this session
    await H.tick(400);
    const s = w.snapshot();
    assert.ok(s.overlay && /integrity/i.test(s.overlay.html), 'no integrity lockout: ' + JSON.stringify(s.overlay));
  });

  await t.check('H5: a second tab starting an exam resumes the existing server session instead', async () => {
    const w = H.createWorld({
      duplicate: { session: { sessionId: 'crc_existing_1', startTime: new Date(Date.now() - 300000).toISOString(), violationCount: 1, durationMs: 3600000 } },
    });
    await w.startExam('Second', 's2@crc-test.local');
    assert.ok(!w.overlays().length, 'setup overlay still present');
    assert.ok(w.snapshot().toasts.some(t => /already exists/.test(t.text)), 'no duplicate-session notice');
    assert.ok(w.snapshot().badgeText.includes('1 of 4'), 'server count not adopted');
  });

  await t.check('H6: a system fullscreen interruption is never counted and shows a NOT-counted info toast', async () => {
    const w = H.createWorld({});
    await w.startExam('S6', 's6@crc-test.local');
    w.fireDoc('fullscreenchange', {});
    await H.tick(200);
    const s = w.snapshot();
    assert.ok(s.badgeText && s.badgeText.includes('0 of 4'), 'interruption counted: ' + s.badgeText);
    const info = s.toasts.find(t => t.cls.includes('crc-toast--info'));
    assert.ok(info && /NOT counted/.test(info.text), 'no NOT-counted toast');
    assert.strictEqual(info.role, 'status');
  });

  /* ================= BACKEND: FIRST FINALIZE WINS ================= */

  async function emailSandbox() {
    const b = H.createBackendSandbox();
    b.emails = [];
    b.ctx.sendViolationReportEmail_ = (to, sid) => { b.emails.push({ to, sid }); return { ok: true, sent: true }; };
    return b;
  }

  await t.check('B1: a late tab_closed finalize never clobbers a Locked row or re-sends its email', async () => {
    const b = await emailSandbox();
    const S = b.data('Sessions');
    const sid = 'crc_final_1';
    const lockedEnd = '2026-01-01T00:00:00Z';
    S.push([sid, 'F1', 'f1@x.edu', 'https://docs.google.com/forms/d/e/FAKEID/viewform', '2026-01-01T00:00:00Z', lockedEnd, 'Locked (Violations)', 4, 'max_violations', 3600000]);
    b.run('endSession', [{ sessionId: sid, reason: 'tab_closed', studentEmail: 'f1@x.edu', endTime: '2026-01-01T01:00:00Z' }]);
    const row = b.rowFor('Sessions', 'Session ID', sid);
    /* contract: the row stays updated, but the terminal status and its
       single email are preserved — the exam was already finalized */
    assert.strictEqual(row[b.headerCol('Sessions', 'Status') - 1], 'Locked (Violations)', 'status clobbered');
    assert.strictEqual(row[b.headerCol('Sessions', 'End Reason') - 1], 'max_violations', 'end reason clobbered');
    assert.strictEqual(b.emails.length, 0, 'repeat email sent for a locked row');
    void lockedEnd;
  });

  await t.check('B2: normal submit finalizes once and duplicate finalize skips the repeat email', async () => {
    const b = await emailSandbox();
    const S = b.data('Sessions');
    const sid = 'crc_final_2';
    S.push([sid, 'F2', 'f2@x.edu', 'https://docs.google.com/forms/d/e/FAKEID/viewform', '2026-01-01T00:00:00Z', '', 'Active', 0, '', 3600000]);
    b.run('endSession', [{ sessionId: sid, reason: 'submitted', studentEmail: 'f2@x.edu' }]);
    let row = b.rowFor('Sessions', 'Session ID', sid);
    assert.strictEqual(row[b.headerCol('Sessions', 'Status') - 1], 'Submitted');
    assert.strictEqual(b.emails.length, 1, 'no first email');
    b.run('endSession', [{ sessionId: sid, reason: 'tab_closed', studentEmail: 'f2@x.edu' }]);
    row = b.rowFor('Sessions', 'Session ID', sid);
    assert.strictEqual(row[b.headerCol('Sessions', 'Status') - 1], 'Submitted', 'duplicate changed status');
    assert.strictEqual(b.emails.length, 1, 'repeat email sent');
  });

  await t.check('B3: an admin unlock resets the row so it can be finalized normally afterwards', async () => {
    const b = await emailSandbox();
    const S = b.data('Sessions');
    const U = b.data('Unlocks');
    const sid = 'crc_final_3';
    S.push([sid, 'F3', 'f3@x.edu', 'https://docs.google.com/forms/d/e/FAKEID/viewform', '2026-01-01T00:00:00Z', '2026-01-01T00:30:00Z', 'Locked (Violations)', 4, 'max_violations', 3600000]);
    b.run('unlockSession', [sid, 'Admin test']);
    let row = b.rowFor('Sessions', 'Session ID', sid);
    assert.strictEqual(row[b.headerCol('Sessions', 'Status') - 1], 'Active', 'not unlocked');
    assert.ok(U.length > 1, 'unlock not recorded');
    b.run('endSession', [{ sessionId: sid, reason: 'submitted', studentEmail: 'f3@x.edu' }]);
    row = b.rowFor('Sessions', 'Session ID', sid);
    assert.strictEqual(row[b.headerCol('Sessions', 'Status') - 1], 'Submitted', 'not finalized after unlock');
    assert.strictEqual(b.emails.length, 1);
  });
};
