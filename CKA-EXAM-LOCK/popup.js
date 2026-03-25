/* ============================================================
   CKA Exam Lockdown — Popup Script
   ============================================================ */
(function () {
  'use strict';

  const dot     = document.getElementById('popup-status-dot');
  const text    = document.getElementById('popup-status-text');
  const details = document.getElementById('popup-details');
  const student = document.getElementById('popup-student');
  const session = document.getElementById('popup-session');
  const testBtn = document.getElementById('popup-test-webhook');
  const testStatus = document.getElementById('popup-test-webhook-status');

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
    if (chrome.runtime.lastError || !res) {
      text.textContent = 'Extension loaded — no active session.';
      dot.className = 'popup-dot popup-dot--idle';
      return;
    }

    if (res.active) {
      text.textContent = 'Exam in progress';
      dot.className = 'popup-dot popup-dot--active';
      details.style.display = 'flex';
      student.textContent = res.student || '—';
      session.textContent = res.sessionId ? res.sessionId.slice(0, 16) : '—';
    } else {
      text.textContent = 'No active exam session.';
      dot.className = 'popup-dot popup-dot--idle';
    }
  });

  function setTestStatus (msg) {
    if (!testStatus) return;
    testStatus.textContent = msg;
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      setTestStatus('Sending test log…');
      chrome.runtime.sendMessage({ type: 'TEST_WEBHOOK' }, res => {
        if (chrome.runtime.lastError || !res) {
          setTestStatus('Test failed: no response from service worker.');
          return;
        }

        if (res.ok) {
          setTestStatus('Test sent. Check Google Sheet + service worker console.');
        } else {
          setTestStatus(`Test failed: ${res.error || 'unknown error'}`);
        }
      });
    });
  }
})();
