/* ---------- CONFIG ---------- */
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbySFDWHkT0eofVZCiuYjigD7JWEy-E6GpHvN0BUWfbPY3TGxa5Z374VJN1HmN0-Ad1F/exec';
const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;

const EXT = globalThis.browser ?? globalThis.chrome;

/* ---------- STATE ---------- */
/* activeSession is mirrored into chrome.storage.session so it survives
   service-worker suspension (Manifest V3) — required for the
   tab-close failsafe below. */
let activeSession = null;   // { sessionId, student, tabId }
/* Last final state (locked / submitted). Kept after the active session is
   cleared so the popup can still render "Exam locked" / "Exam submitted"
   instead of "No active exam session" (R-A fix). */
let lastFinal = null;       // { sessionId, student, studentEmail, status }

async function persistActiveSession (session) {
  activeSession = session;
  try {
    if (EXT?.storage?.session?.set) {
      await EXT.storage.session.set({ activeSession: session });
    }
  } catch (err) {
    console.error('[CRC] persistActiveSession failed:', err);
  }
}

async function loadActiveSession () {
  try {
    if (EXT?.storage?.session?.get) {
      const r = await EXT.storage.session.get('activeSession');
      if (r && r.activeSession) return r.activeSession;
    }
  } catch (err) {
    console.error('[CRC] loadActiveSession failed:', err);
  }
  return activeSession;
}

/* ==========================================================
   MESSAGE ROUTER
   ========================================================== */
EXT.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'EXAM_ACTIVE':
      persistActiveSession({
        sessionId : msg.sessionId,
        student   : msg.student,
        studentEmail: msg.studentEmail,
        durationMs  : msg.durationMs,
        tabId     : sender.tab?.id ?? null,
      });
      lastFinal = null; // a new exam starts a fresh lifecycle
      setBadge('ON', '#059669');
      sendResponse({ ok: true });
      break;

    case 'SESSION_FINAL':
      /* explicit final-state signal from the content script (server-discovered
         lock/submit paths, which never send END_SESSION) */
      lastFinal = {
        sessionId    : msg.sessionId,
        student      : msg.student,
        studentEmail : msg.studentEmail,
        status       : msg.status === 'submitted' ? 'submitted' : 'locked',
      };
      sendResponse({ ok: true });
      break;

    case 'EXAM_INACTIVE':
      persistActiveSession(null);
      /* lastFinal survives teardown so the popup keeps its final state */
      setBadge('', '#000000');
      sendResponse({ ok: true });
      break;

    case 'LOG_SESSION':
      /* return the backend's response so the content script can detect
         a duplicate active session and resume it instead */
      postToSheets({ action: 'log_session', ...msg.data })
        .then(body => sendResponse(body && body.ok ? body : { ok: true }))
        .catch(err => {
          console.error('[CRC] LOG_SESSION failed:', err);
          sendResponse({ ok: false, error: String(err?.message || err) });
        });
      break;

    case 'LOG_VIOLATION':
      postToSheets({ action: 'log_violation', ...msg.data }).catch(() => {});
      sendResponse({ ok: true });
      break;

    case 'LOG_AUDIT':
      /* system interruptions etc. — written to the audit log, never
         counted as violations */
      postToSheets({ action: 'log_audit', ...msg.data }).catch(() => {});
      sendResponse({ ok: true });
      break;

    case 'END_SESSION':
      /* Clear the tracked session immediately (before the webhook
         resolves) so a tab close cannot double-finalize it. */
      persistActiveSession(null);
      /* remember the final state so the popup can still report it */
      if (msg.reason === 'submitted') {
        lastFinal = { sessionId: msg.sessionId, student: msg.student, studentEmail: msg.studentEmail, status: 'submitted' };
      } else if (msg.reason === 'max_violations' || msg.reason === 'time_expired') {
        lastFinal = { sessionId: msg.sessionId, student: msg.student, studentEmail: msg.studentEmail, status: 'locked' };
      }
      postToSheets({
        action    : 'end_session',
        sessionId : msg.sessionId,
        student   : msg.student,
        studentEmail: msg.studentEmail,
        durationMs  : msg.durationMs,
        reason    : msg.reason,
        endTime   : new Date().toISOString(),
      })
        .then(() => sendResponse({ ok: true }))
        .catch(err => {
          console.error('[CRC] END_SESSION failed:', err);
          sendResponse({ ok: false, error: String(err?.message || err) });
        });
      setBadge('', '#000000');
      break;

    case 'GET_STATUS':
      /* the SW may have been suspended since the session started —
         hydrate it from storage.session before answering */
      loadActiveSession().then(sess => {
        const s = sess || activeSession;
        if (!s) {
          /* no running session — report the last final state if there is one */
          sendResponse({
            active        : false,
            final         : lastFinal || null,
            sessionId     : lastFinal?.sessionId ?? null,
            student       : lastFinal?.student ?? null,
            studentEmail  : lastFinal?.studentEmail ?? null,
            durationMs    : null,
            live          : null,
          });
          return;
        }
        const base = {
          active     : !!s,
          sessionId  : s?.sessionId ?? null,
          student    : s?.student ?? null,
          studentEmail : s?.studentEmail ?? null,
          durationMs : s?.durationMs ?? null,
        };
        if (s?.tabId) {
          /* pull live state from the content script for accuracy */
          try {
            EXT.tabs.sendMessage(s.tabId, { type: 'GET_LIVE_STATUS' })
              .then(live => sendResponse({ ...base, live: live || null }))
              .catch(() => sendResponse({ ...base, live: null }));
            return;
          } catch (err) {
            console.error('[CRC] GET_LIVE_STATUS failed:', err);
          }
        }
        sendResponse({ ...base, live: null });
      }).catch(err => {
        console.error('[CRC] GET_STATUS failed:', err);
        sendResponse({ active: false, live: null });
      });
      break;

    case 'TEST_WEBHOOK':
      postToSheets({
        action      : 'log_violation',
        sessionId   : activeSession?.sessionId ?? `test_${Date.now()}`,
        studentName : activeSession?.student ?? 'Test Student',
        violation   : 'webhook_test',
        severity    : 'info',
        details     : 'Manual webhook test from popup.',
        timestamp   : new Date().toISOString(),
      })
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
      break;

    default:
      sendResponse({ ok: false, error: 'unknown message type' });
  }

  return true;
});


async function postToSheets (payload, attempt = 1) {
  if (!WEBHOOK_URL || WEBHOOK_URL === 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE') {
    console.warn('[CRC] Webhook URL not configured — skipping POST.', payload);
    throw new Error('Webhook URL not configured');
  }

  try {

    const resp = await fetch(WEBHOOK_URL, {
      method   : 'POST',
      headers  : { 'Content-Type': 'text/plain;charset=utf-8' },
      body     : JSON.stringify(payload),
      redirect : 'follow',          // follow Apps Script's 302 redirect
    });
    console.log('[CRC] ✅ Logged to Google Sheets:', payload.action, resp.status, payload);
    /* return the backend's JSON body so callers can react to it */
    return await resp.json().catch(() => null);
  } catch (err) {
    console.error(`[CRC] ❌ Sheets POST failed (attempt ${attempt}):`, err);
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return postToSheets(payload, attempt + 1); // resolves only after retries exhaust
    }

    throw err;
  }
}



function setBadge (text, colour) {
  try {
    EXT.action.setBadgeText({ text });
    EXT.action.setBadgeBackgroundColor({ color: colour });
  } catch { /* ignore */ }
}

function notifyContentScript (tabId, msg) {
  if (!tabId) return;
  try {
    EXT.tabs.sendMessage(tabId, msg).catch(() => {});
  } catch { /* tab might have closed */ }
}

EXT.runtime.onInstalled.addListener(() => {
  console.log('[CRC Exam Lockdown] Extension installed / updated.');
  setBadge('', '#000000');
});

/* ==========================================================
   TAB-CLOSE FAILSAFE
   If the exam tab is closed before the content script could
   finalize the session, end it here so the exam is never
   "lost in transit" (reason: tab_closed). Sessions that were
   already finalized via END_SESSION have no tracked session,
   so this will not double-finalize them.
   ========================================================== */
EXT.tabs.onRemoved.addListener(async (tabId) => {
  const session = await loadActiveSession();
  if (!session || !session.tabId || session.tabId !== tabId) return;

  console.warn('[CRC] Exam tab closed before finalization — ending session:', session.sessionId);
  try {
    await postToSheets({
      action    : 'end_session',
      sessionId : session.sessionId,
      student   : session.student,
      studentEmail: session.studentEmail,
      durationMs  : session.durationMs,
      reason    : 'tab_closed',
      endTime   : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[CRC] Tab-close finalize failed:', err);
  }
  persistActiveSession(null);
  setBadge('', '#000000');
});
