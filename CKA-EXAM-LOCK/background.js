/* ---------- CONFIG ---------- */
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx_DIVOKWf_MN5bsDama2HfBFRPlIWc8lgmOa93Z20bvoHEpsyOyLZgDILh1xk0SEDT/exec';
const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;

/* ---------- STATE ---------- */
let activeSession = null;   // { sessionId, student, tabId }

/* ==========================================================
   MESSAGE ROUTER
   ========================================================== */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'EXAM_ACTIVE':
      activeSession = {
        sessionId : msg.sessionId,
        student   : msg.student,
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
        reason    : msg.reason,
        endTime   : new Date().toISOString(),
      });
      activeSession = null;
      setBadge('', '#000000');
      sendResponse({ ok: true });
      break;

    case 'GET_STATUS':
      sendResponse({
        active    : !!activeSession,
        sessionId : activeSession?.sessionId ?? null,
        student   : activeSession?.student ?? null,
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
  if (!WEBHOOK_URL) {
    console.warn('[CKA] Webhook URL not configured — skipping POST.', payload);
    throw new Error('Webhook URL not configured');
  }

  try {
    /*
     * CRITICAL FIX: Google Apps Script doPost() behind `no-cors` mode
     * requires Content-Type OTHER THAN application/json to avoid
     * triggering a CORS preflight OPTIONS request (which Apps Script
     * does not handle). We send as text/plain with a JSON body and
     * parse it inside the Apps Script with JSON.parse(e.postData.contents).
     */
    const resp = await fetch(WEBHOOK_URL, {
      method   : 'POST',
      headers  : { 'Content-Type': 'text/plain;charset=utf-8' },
      body     : JSON.stringify(payload),
      redirect : 'follow',          // follow Apps Script's 302 redirect
    });
    console.log('[CKA] ✅ Logged to Google Sheets:', payload.action, resp.status, payload);
    return;
  } catch (err) {
    console.error(`[CKA] ❌ Sheets POST failed (attempt ${attempt}):`, err);
    if (attempt < MAX_RETRIES) {
      setTimeout(() => postToSheets(payload, attempt + 1), RETRY_DELAY);
      return;
    }

    throw err;
  }
}



function setBadge (text, colour) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: colour });
  } catch { /* ignore */ }
}

function notifyContentScript (tabId, msg) {
  if (!tabId) return;
  try {
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  } catch { /* tab might have closed */ }
}

/* ---------- Install / update ---------- */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CKA Exam Lockdown] Extension installed / updated.');
  setBadge('', '#000000');
});
