(function () {
  'use strict';

  const dot        = document.getElementById('popup-status-dot');
  const text       = document.getElementById('popup-status-text');
  const details    = document.getElementById('popup-details');
  const student    = document.getElementById('popup-student');
  const session    = document.getElementById('popup-session');
  const timeEl     = document.getElementById('popup-time');
  const violEl     = document.getElementById('popup-violations');
  const note       = document.getElementById('popup-note');
  const testBtn    = document.getElementById('popup-test-webhook');
  const testStatus = document.getElementById('popup-test-webhook-status');

  const MAX_VIOLATIONS = 4;

  function ordinal (n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return n + 'th';
    const mod10 = n % 10;
    return n + (mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th');
  }

  function fmtTime (ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function setIdle (msg) {
    text.textContent = msg;
    dot.className = 'popup-dot popup-dot--idle';
    details.style.display = 'none';
  }

  function render (res) {
    if (!res) return setIdle('Extension loaded — no active session.');

    const live = res.live || {};

    if (!res.active) {
      /* the active session was torn down — show the last final state
         (locked / submitted) if the background still knows it (R-A fix) */
      if (res.final && res.final.status) {
        details.style.display = 'flex';
        student.textContent = res.final.student || '—';
        session.textContent = res.final.sessionId ? res.final.sessionId.slice(0, 16) : '—';
        timeEl.textContent = '—';
        violEl.textContent = '—';
        violEl.className = 'popup-detail-row__value';
        if (res.final.status === 'submitted') {
          text.textContent = 'Exam submitted';
          dot.className = 'popup-dot popup-dot--done';
          note.textContent = 'Your responses have been recorded. You may close this tab.';
        } else {
          text.textContent = 'Exam locked';
          dot.className = 'popup-dot popup-dot--danger';
          note.textContent = 'Contact your invigilator — they can review and unlock your session.';
        }
        return;
      }
      return setIdle('No active exam session.');
    }

    /* an active session exists — show its details */
    details.style.display = 'flex';
    student.textContent = res.student || '—';
    session.textContent = res.sessionId ? res.sessionId.slice(0, 16) : '—';
    timeEl.textContent = fmtTime(live.remainingMs);
    /* same N of 4 language as the in-exam badge, so the two surfaces never
       contradict each other mid-exam (R-E fix) */
    violEl.textContent =
      (live.violationCount != null ? live.violationCount : '—') +
      ' of ' + MAX_VIOLATIONS + ' — the ' + ordinal(MAX_VIOLATIONS) + ' locks your exam';
    violEl.className = 'popup-detail-row__value';
    if ((live.violationCount || 0) >= MAX_VIOLATIONS - 1) {
      violEl.classList.add('value--danger');
    } else if ((live.violationCount || 0) > 0) {
      violEl.classList.add('value--warn');
    }

    if (live.isSubmitted) {
      text.textContent = 'Exam submitted';
      dot.className = 'popup-dot popup-dot--done';
      note.textContent = 'Your responses have been recorded. You may close this tab.';
      return;
    }

    if (live.isLocked) {
      text.textContent = 'Exam locked';
      dot.className = 'popup-dot popup-dot--danger';
      note.textContent = 'Contact your invigilator — they can review and unlock your session.';
      return;
    }

    text.textContent = 'Exam in progress';
    dot.className = 'popup-dot popup-dot--active';
    note.textContent =
      'Only deliberate actions count as violations (switching tabs/apps, copy-paste, leaving fullscreen). System notifications are NOT counted.';
  }

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
    if (chrome.runtime.lastError || !res) {
      setIdle('Extension loaded — no active session.');
      return;
    }
    render(res);
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
