/* ============================================================
   CKA Exam Lockdown — Background Service Worker
   Handles Google Sheets logging, tab monitoring, and keep-alive.
   ============================================================ */

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

    default:
      sendResponse({ ok: false, error: 'unknown message type' });
  }

  return true;
});

/* ==========================================================
   TAB MONITORING — detect tab switches during active exam
   ========================================================== */
chrome.tabs.onActivated.addListener(info => {
  if (!activeSession) return;

  if (info.tabId !== activeSession.tabId) {
    notifyContentScript(activeSession.tabId, {
      type    : 'TAB_SWITCH_DETECTED',
      message : 'Switched to a different tab.',
    });

    postToSheets({
      action      : 'log_violation',
      sessionId   : activeSession.sessionId,
      studentName : activeSession.student,
      violation   : 'tab_switch_bg',
      severity    : 'high',
      details     : 'Background detected tab switch away from exam.',
      timestamp   : new Date().toISOString(),
    });
  }
});

/* ==========================================================
   GOOGLE SHEETS WEBHOOK
   ========================================================== */
async function postToSheets (payload, attempt = 1) {
  if (!WEBHOOK_URL || WEBHOOK_URL === 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE') {
    console.warn('[CKA] Webhook URL not configured — skipping POST.', payload);
    return;
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
  } catch (err) {
    console.error(`[CKA] ❌ Sheets POST failed (attempt ${attempt}):`, err);
    if (attempt < MAX_RETRIES) {
      setTimeout(() => postToSheets(payload, attempt + 1), RETRY_DELAY);
    }
  }
}

/* ==========================================================
   HELPERS
   ========================================================== */

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

/* ---------- Keep-alive alarm ---------- */
chrome.alarms?.create('cka-keepalive', { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener(alarm => {
  if (alarm.name === 'cka-keepalive') { /* no-op keep-alive */ }
});

/* ---------- Install / update ---------- */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CKA Exam Lockdown] Extension installed / updated.');
  setBadge('', '#000000');
});
