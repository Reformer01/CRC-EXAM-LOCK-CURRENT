/* ---------- CONFIG ---------- */
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbySFDWHkT0eofVZCiuYjigD7JWEy-E6GpHvN0BUWfbPY3TGxa5Z374VJN1HmN0-Ad1F/exec';
const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;

const EXT = globalThis.browser ?? globalThis.chrome;

/* ---------- STATE ---------- */
let activeSession = null;   // { sessionId, student, tabId }

/* ==========================================================
   MESSAGE ROUTER
   ========================================================== */
EXT.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'EXAM_ACTIVE':
      activeSession = {
        sessionId : msg.sessionId,
        student   : msg.student,
        studentEmail: msg.studentEmail,
        durationMs  : msg.durationMs,
        tabId     : sender.tab?.id ?? null,
      };
      setBadge('ON', '#059669');
      sendResponse({ ok: true });
      break;

    case 'EXAM_INACTIVE':
      activeSession = null;
      setBadge('', '#000000');
      sendResponse({ ok: true });
      break;

    case 'LOG_SESSION':
      postToSheets({ action: 'log_session', ...msg.data });
      sendResponse({ ok: true });
      break;

    case 'LOG_VIOLATION':
      postToSheets({ action: 'log_violation', ...msg.data });
      sendResponse({ ok: true });
      break;

    case 'END_SESSION':
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
      activeSession = null;
      setBadge('', '#000000');
      break;

    case 'GET_STATUS':
      sendResponse({
        active    : !!activeSession,
        sessionId : activeSession?.sessionId ?? null,
        student   : activeSession?.student ?? null,
        studentEmail: activeSession?.studentEmail ?? null,
        durationMs  : activeSession?.durationMs ?? null,
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
    return;
  } catch (err) {
    console.error(`[CRC] ❌ Sheets POST failed (attempt ${attempt}):`, err);
    if (attempt < MAX_RETRIES) {
      setTimeout(() => postToSheets(payload, attempt + 1), RETRY_DELAY);
      return;
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
