(function () {
  'use strict';

  if (window.__crcExamLockLoaded) return;
  window.__crcExamLockLoaded = true;


  const CFG = Object.freeze({
    EXAM_DURATION_MS : 2 * 60 * 60 * 1000,   // 2 hours
    MAX_VIOLATIONS   : 4,
    SCHOOL_NAME      : 'CRC',
    COOLDOWN_MS      : 1500,                  // global cooldown
    TOAST_DURATION   : 4000,
    DEVTOOLS_CHECK_MS: 3000,
    UNLOCK_POLL_MS   : 5000,

    WEBHOOK_URL      : 'https://script.google.com/macros/s/AKfycbySFDWHkT0eofVZCiuYjigD7JWEy-E6GpHvN0BUWfbPY3TGxa5Z374VJN1HmN0-Ad1F/exec',
  });


  function formId () {
    const m = location.pathname.match(
      /\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([A-Za-z0-9_-]+)/
    );
    return m ? m[1] : location.pathname.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /** Format milliseconds → "H:MM:SS". */
  function fmtTime (ms) {
    if (ms <= 0) return '0:00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Generate a short random session ID. */
  function genId () {
    return 'crc_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }

  const EXT = globalThis.browser ?? globalThis.chrome;

  /** Safe chrome.storage.local get. */
  function storageGet (key) {
    return new Promise(resolve => {
      try {
        if (!EXT?.storage?.local?.get) return resolve(undefined);
        EXT.storage.local.get([key], r => resolve(r[key]));
      }
      catch { resolve(undefined); }
    });
  }

  /** Safe chrome.storage.local set. */
  function storageSet (obj) {
    return new Promise(resolve => {
      try {
        if (!EXT?.storage?.local?.set) return resolve();
        EXT.storage.local.set(obj, resolve);
      }
      catch { resolve(); }
    });
  }

  /** Send a message to the background service-worker. */
  function bg (msg, callback) {
    try {
      if (callback) {
        EXT?.runtime?.sendMessage(msg, (resp) => {
          const runtimeError = EXT?.runtime?.lastError;
          if (runtimeError) {
            console.error('[CRC] Runtime error:', runtimeError);
            callback({ ok: false, error: runtimeError.message });
          } else {
            callback(resp);
          }
        });
      } else {
        EXT?.runtime?.sendMessage?.(msg);
      }
    } catch (err) {
      console.error('[CRC] bg send error:', err);
      if (callback) callback({ ok: false, error: String(err) });
    }
  }


  class CRCExamLockdown {
    constructor () {
      this.FORM_ID     = formId();
      this.STORAGE_KEY = `crcSession_${this.FORM_ID}`;

      /* runtime state — will be hydrated from storage */
      this.state = {
        sessionId      : null,
        studentName    : '',
        studentEmail   : '',
        durationMs     : null,
        startTime      : null,
        violationCount : 0,
        isStarted      : false,
        isSubmitted    : false,
        isLocked       : false,
        violations     : [],
        lastClearedAt  : '',
      };

      /* UI handles */
      this.timerEl           = null;
      this.violationBadgeEl  = null;
      this.overlayEl         = null;
      this.fullscreenBanner  = null;


      this.cooldowns = {};
      this.lastViolationAt = 0;

      /* timer interval id */
      this.timerInterval = null;

      /* devtools detection interval */
      this.devtoolsInterval = null;

      /* remote unlock polling interval */
      this.unlockPollInterval = null;

      /* whether we are in the middle of re-entering fullscreen */
      this.reenteringFS = false;

      /* focus check state for grace-period detection */
      this.focusCheckTimer   = null;
      this.isSubmitting       = false;
      this.lastFocusLossAt    = 0;
      this.lastBlurAt         = 0;

      /* grace period before recording visibility/blur violations (ms) */
      this.GRACE_PERIOD_MS    = 250;
      this.RAPID_EVENT_WINDOW  = 2000;

      this.isResponsePage =
        location.pathname.includes('/formResponse') ||
        location.search.includes('formResponse');

      this.init();
    }


    async init () {
      await this.loadState();

      if (this.isResponsePage) {
        return this.handleResponsePage();
      }

      if (this.state.isLocked) {
        this.showLockout('Your exam has been locked due to violations.');
        this.startUnlockPolling();
        return;
      }

      if (this.state.isSubmitted) {
        return; // Removed showSubmitted call - function was deleted
      }

      if (this.state.isStarted && this.state.startTime) {
        const remaining = this.getRemainingMs();
        if (remaining <= 0) {
          return this.handleTimeExpired();
        }
        return this.resumeExam();
      }

      /* brand-new session → show setup */
      this.showSetup();
    }

    async loadState () {
      const saved = await storageGet(this.STORAGE_KEY);
      if (saved) {
        try {
          const parsed = (typeof saved === 'string') ? JSON.parse(saved) : saved;
          if (parsed && typeof parsed === 'object') {
            this.state = { ...this.state, ...parsed };
          }
        } catch { /* ignore bad JSON */ }
      }
    }

    async saveState () {
      await storageSet({ [this.STORAGE_KEY]: JSON.stringify(this.state) });
    }

    getExamDurationMs () {
      return Number(this.state.durationMs) > 0
        ? Number(this.state.durationMs)
        : CFG.EXAM_DURATION_MS;
    }

    getRemainingMs () {
      if (!this.state.startTime) return this.getExamDurationMs();
      return Math.max(0,
        this.getExamDurationMs() - (Date.now() - this.state.startTime));
    }

    /** Remove any current overlay. */
    clearOverlay () {
      if (this.overlayEl) {
        this.overlayEl.remove();
        this.overlayEl = null;
      }
    }

    /** Build and show the name-entry "Start Exam" overlay. */
    showSetup () {
      this.clearOverlay();

      const overlay = document.createElement('div');
      overlay.className = 'crc-overlay';
      overlay.innerHTML = `
        <div class="crc-card">
          <div class="crc-card-icon crc-card-icon--blue">🛡️</div>
          <h2>${CFG.SCHOOL_NAME} Exam Lockdown</h2>
          <p>
            This exam is proctored. You have <strong>limited time</strong> to complete it.
            Tab-switching, copy-paste and developer tools are not allowed.
          </p>
          <input
            id="crc-name-input"
            class="crc-input"
            type="text"
            placeholder="Enter your full name"
            autocomplete="off"
            spellcheck="false"
          />
          <input
            id="crc-email-input"
            class="crc-input"
            type="email"
            placeholder="Enter your email"
            autocomplete="off"
            spellcheck="false"
          />
          <select id="crc-duration-input" class="crc-input">
            <option value="1800000">30 minutes</option>
            <option value="2700000">45 minutes</option>
            <option value="3600000">60 minutes</option>
            <option value="5400000">90 minutes</option>
            <option value="7200000" selected>120 minutes</option>
          </select>
          <div id="crc-name-error" class="crc-error" style="display:none"></div>
          <button id="crc-start-btn" class="crc-btn crc-btn--primary">
            🚀&ensp;Start Exam
          </button>
          <div class="crc-brand">${CFG.SCHOOL_NAME} EXAM PROCTORING SYSTEM</div>
        </div>`;

      document.body.appendChild(overlay);
      this.overlayEl = overlay;

      const input = overlay.querySelector('#crc-name-input');
      const email = overlay.querySelector('#crc-email-input');
      const dur   = overlay.querySelector('#crc-duration-input');
      const btn   = overlay.querySelector('#crc-start-btn');
      const err   = overlay.querySelector('#crc-name-error');

      btn.addEventListener('click', () => {
        const name = input.value.trim();
        const mail = email.value.trim();
        const durationMs = Number(dur.value);
        if (name.length < 2) {
          err.textContent = 'Please enter your full name (at least 2 characters).';
          err.style.display = 'block';
          input.focus();
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
          err.textContent = 'Please enter a valid email address.';
          err.style.display = 'block';
          email.focus();
          return;
        }
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
          err.textContent = 'Please choose an exam duration.';
          err.style.display = 'block';
          dur.focus();
          return;
        }
        this.beginExam(name, mail, durationMs);
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') btn.click();
      });

      input.focus();
    }

    /** Lockout overlay (violations exceeded or time expired). */
    showLockout (reason) {
      this.clearOverlay();
      this.removeTimer();

      const overlay = document.createElement('div');
      overlay.className = 'crc-overlay';
      overlay.innerHTML = `
        <div class="crc-card">
          <div class="crc-card-icon crc-card-icon--red">🚫</div>
          <h2>Exam Locked</h2>
          <p>${reason}</p>
          <p style="font-size:13px;color:#64748b;">
            Contact your invigilator for assistance.<br>
            Student: <strong>${this.state.studentName}</strong><br>
            Violations: <strong>${this.state.violationCount} / ${CFG.MAX_VIOLATIONS}</strong>
          </p>
          <div class="crc-brand">${CFG.SCHOOL_NAME} EXAM PROCTORING SYSTEM</div>
        </div>`;
      document.body.appendChild(overlay);
      this.overlayEl = overlay;
    }

    startUnlockPolling () {
      this.stopUnlockPolling();

      if (!this.state.sessionId) return;
      if (!CFG.WEBHOOK_URL || CFG.WEBHOOK_URL === 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE') return;

      const check = async () => {
        try {
          const url = new URL(CFG.WEBHOOK_URL);
          url.searchParams.set('action', 'session_status');
          url.searchParams.set('sessionId', this.state.sessionId);

          const resp = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
          const data = await resp.json().catch(() => null);

          if (data && data.ok) {
            if (data.clearedAt && data.clearedAt !== this.state.lastClearedAt) {
              this.applyRemoteClear(data.clearedAt);
            }
            if (data.unlocked === true) {
              this.unlockFromAdmin(data.clearedAt || null);
            }
          }
        } catch {
          /* ignore; will retry */
        }
      };

      check();
      this.unlockPollInterval = setInterval(check, CFG.UNLOCK_POLL_MS);
    }

    stopUnlockPolling () {
      if (this.unlockPollInterval) {
        clearInterval(this.unlockPollInterval);
        this.unlockPollInterval = null;
      }
    }

    applyRemoteClear (clearedAt) {
      this.state.violationCount = 0;
      this.state.violations = [];
      this.state.lastClearedAt = clearedAt || '';
      this.saveState();

      if (this.violationBadgeEl) this.updateViolationBadge();
    }

    unlockFromAdmin (clearedAt) {
      this.stopUnlockPolling();
      this.state.isLocked = false;

      if (clearedAt && clearedAt !== this.state.lastClearedAt) {
        this.applyRemoteClear(clearedAt);
      }

      this.saveState();
      this.clearOverlay();

      this.showToast('Admin cleared your session. You may continue the exam.', 'info');
      this.resumeExam();
    }

    handleResponsePage () {
      /* Mark session as submitted (if one exists) */
      if (this.state.isStarted && !this.state.isSubmitted) {
        this.state.isSubmitted = true;
        this.saveState();
        this.logEvent('exam_submitted', 'info',
          'Student submitted their form.');
      }
      this.stopUnlockPolling();
      // Removed showSubmitted overlay - student can see Google Forms confirmation directly
    }


    beginExam (name, email, durationMs) {
      this.stopUnlockPolling();
      this.state.sessionId      = genId();
      this.state.studentName    = name;
      this.state.studentEmail   = email;
      this.state.durationMs     = durationMs;
      this.state.startTime      = Date.now();
      this.state.isStarted      = true;
      this.state.violationCount = 0;
      this.state.isSubmitted    = false;
      this.state.isLocked       = false;
      this.state.violations     = [];

      this.saveState();
      this.clearOverlay();

      /* Log session start */
      const minutes = Math.round(this.getExamDurationMs() / 60000);
      this.logEvent('exam_started', 'info',
        `Exam started by ${name}. Duration: ${minutes} minutes.`);
      bg({
        type : 'LOG_SESSION',
        data : {
          sessionId   : this.state.sessionId,
          studentName : name,
          studentEmail: email,
          durationMs  : this.getExamDurationMs(),
          formUrl     : location.href,
          startTime   : new Date(this.state.startTime).toISOString(),
        },
      });

      this.activateExamMode();
    }

    resumeExam () {
      this.stopUnlockPolling();
      this.clearOverlay();
      this.activateExamMode();
    }

    /** Shared activation logic for both begin and resume. */
    activateExamMode () {
      this.createTimerUI();
      this.createViolationBadge();
      this.startTimer();
      this.attachMonitors();
      
      // Delay fullscreen request to ensure page is ready
      setTimeout(() => {
        this.requestFullscreen();
      }, 500);
      
      this.startDevtoolsCheck();
      this.watchForSubmission();

      /* tell background this tab has an active exam */
      bg({
        type      : 'EXAM_ACTIVE',
        sessionId : this.state.sessionId,
        student   : this.state.studentName,
        studentEmail: this.state.studentEmail,
        durationMs  : this.getExamDurationMs(),
      });
    }

    /* --------------------------------------------------
       TIMER UI + LOGIC
       -------------------------------------------------- */
    createTimerUI () {
      if (this.timerEl) return;
      const el = document.createElement('div');
      el.className = 'crc-timer crc-timer--green';
      el.innerHTML = '<span class="crc-timer-icon">⏱️</span><span id="crc-time-text"></span>';
      document.body.appendChild(el);
      this.timerEl = el;
      this.updateTimerDisplay();
    }

    removeTimer () {
      if (this.timerInterval) clearInterval(this.timerInterval);
      if (this.timerEl) { this.timerEl.remove(); this.timerEl = null; }
    }

    startTimer () {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => this.tick(), 1000);
    }

    tick () {
      const remaining = this.getRemainingMs();

      if (remaining <= 0) {
        this.handleTimeExpired();
        return;
      }

      this.updateTimerDisplay();
      this.checkTimeWarnings(remaining);
    }

    updateTimerDisplay () {
      if (!this.timerEl) return;
      const remaining = this.getRemainingMs();
      const text = this.timerEl.querySelector('#crc-time-text');
      if (text) text.textContent = fmtTime(remaining);

      /* colour classes */
      const mins = remaining / 60000;
      this.timerEl.className = 'crc-timer ' + (
        mins > 30   ? 'crc-timer--green'  :
        mins > 15   ? 'crc-timer--yellow' :
        mins >  5   ? 'crc-timer--orange' :
                      'crc-timer--red crc-timer--pulse'
      );
    }

    /** Show full-width time-warning banners at specific thresholds. */
    checkTimeWarnings (remaining) {
      const mins   = Math.floor(remaining / 60000);
      const secs   = Math.floor(remaining / 1000);
      const checks = [
        { at: 30 * 60, cls: 'amber',  msg: '30 minutes remaining' },
        { at: 15 * 60, cls: 'orange', msg: '15 minutes remaining' },
        { at:  5 * 60, cls: 'red',    msg: '5 minutes remaining — please finish up' },
        { at:  1 * 60, cls: 'red',    msg: '1 minute remaining!' },
      ];
      for (const c of checks) {
        if (secs === c.at) {
          this.showToast(c.msg, 'warning');
        }
      }
    }

    handleTimeExpired () {
      this.state.isLocked = true;
      this.saveState();
      this.teardown();
      const minutes = Math.round(this.getExamDurationMs() / 60000);
      this.logEvent('time_expired', 'critical',
        `Exam time (${minutes} minutes) has expired.`);
      bg({
        type      : 'END_SESSION',
        sessionId : this.state.sessionId,
        student   : this.state.studentName,
        studentEmail: this.state.studentEmail,
        durationMs  : this.getExamDurationMs(),
        reason    : 'time_expired',
      }, (resp) => {
        if (!resp || !resp.ok) {
          console.error('[CRC] END_SESSION error:', resp?.error);
          this.showToast('Failed to finalize session. Please contact support.', 'error');
        } else {
          this.showToast('Session finalized. A violation report will be emailed if any violations occurred.', 'info');
        }
      });
      this.showLockout(
        'Your exam time has expired. The exam is now locked.'
      );
    }

    /* --------------------------------------------------
       VIOLATION BADGE
       -------------------------------------------------- */
    createViolationBadge () {
      if (this.violationBadgeEl) return;
      const el = document.createElement('div');
      el.className = 'crc-violation-badge';
      document.body.appendChild(el);
      this.violationBadgeEl = el;
      this.updateViolationBadge();
    }

    updateViolationBadge () {
      if (!this.violationBadgeEl) return;
      const c = this.state.violationCount;
      this.violationBadgeEl.textContent = `⚠️ Violations: ${c} / ${CFG.MAX_VIOLATIONS}`;
      this.violationBadgeEl.className = 'crc-violation-badge' +
        (c >= 3 ? ' crc-violation-badge--danger' :
         c >= 2 ? ' crc-violation-badge--warn' : '');
    }

    /* --------------------------------------------------
       TOAST NOTIFICATIONS
       -------------------------------------------------- */
    showToast (message, level = 'warning') {
      const t = document.createElement('div');
      t.className = `crc-toast crc-toast--${level}`;
      const msgEl = document.createElement('div');
      msgEl.className = 'crc-toast__msg';
      msgEl.textContent = message;
      t.appendChild(msgEl);

      const shouldShowFullscreenBtn =
        !document.fullscreenElement &&
        level !== 'info';

      if (shouldShowFullscreenBtn) {
        const actions = document.createElement('div');
        actions.className = 'crc-toast__actions';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'crc-toast__btn';
        btn.textContent = 'Return to Full Screen';
        btn.addEventListener('click', async () => {
          try {
            await document.documentElement.requestFullscreen();
            t.remove();
          } catch (err) {
            this.showToast('Unable to enter full screen. Click on the page and try again.', 'warning');
          }
        });

        actions.appendChild(btn);
        t.appendChild(actions);
      }
      document.body.appendChild(t);
      setTimeout(() => {
        t.classList.add('crc-toast--exit');
        setTimeout(() => t.remove(), 350);
      }, CFG.TOAST_DURATION);
    }

    /* --------------------------------------------------
       VIOLATION RECORDING
       -------------------------------------------------- */
    recordViolation (type, severity, details) {
      /* enforce cooldown */
      const now = Date.now();
      if (this.lastViolationAt && now - this.lastViolationAt < CFG.COOLDOWN_MS) {
        return;
      }
      this.lastViolationAt = now;
      this.cooldowns[type] = now;

      this.state.violationCount++;
      this.state.violations.push({
        type, severity, details, timestamp: now,
      });
      this.saveState();
      this.updateViolationBadge();

      this.showToast(
        '⚠️ Violation ' + this.state.violationCount + '/' + CFG.MAX_VIOLATIONS + ': ' + details,
        severity === 'critical' ? 'error' : 'warning'
      );

      /* send to background for Google Sheets */
      this.logEvent(type, severity, details);

      /* check max */
      if (this.state.violationCount >= CFG.MAX_VIOLATIONS) {
        this.state.isLocked = true;
        this.saveState();
        this.teardown();
        this.logEvent('exam_locked', 'critical',
          `Exam locked after ${CFG.MAX_VIOLATIONS} violations.`);
        bg({
          type      : 'END_SESSION',
          sessionId : this.state.sessionId,
          student   : this.state.studentName,
          studentEmail: this.state.studentEmail,
          durationMs  : this.getExamDurationMs(),
          reason    : 'max_violations',
        }, (resp) => {
          if (!resp || !resp.ok) {
            console.error('[CRC] END_SESSION error:', resp?.error);
            this.showToast('Failed to finalize session. Please contact support.', 'error');
          } else {
            this.showToast('Session finalized. A violation report will be emailed if any violations occurred.', 'info');
          }
        });
        this.showLockout(
          `You have reached the maximum of ${CFG.MAX_VIOLATIONS} violations. Your exam is now locked.`
        );
      }
    }

    /* --------------------------------------------------
       LOGGING  →  Background  →  Google Sheets
       -------------------------------------------------- */
    logEvent (type, severity, details) {
      bg({
        type : 'LOG_VIOLATION',
        data : {
          sessionId   : this.state.sessionId,
          studentName : this.state.studentName,
          studentEmail: this.state.studentEmail,
          formUrl     : location.href,
          violation   : type,
          severity    : severity,
          details     : details,
          timestamp   : new Date().toISOString(),
        },
      });
    }

    attachMonitors () {
      const on = (target, evt, fn, opts) => {
        target.addEventListener(evt, fn, opts);
        this.cleanups.push(() => target.removeEventListener(evt, fn, opts));
      };

      /* ---- visibility / blur with grace-period detection ---- */
      this._setupGracePeriodMonitors(on);

      /* ---- keyboard shortcuts ---- */
      on(document, 'keydown', e => {
        if (!this.state.isStarted || this.state.isLocked) return;

        /* Allow normal typing inside form inputs */
        const tag = (e.target.tagName || '').toLowerCase();
        const isInput = ['input', 'textarea', 'select'].includes(tag) ||
                        e.target.isContentEditable;

        /* Block dangerous combos */
        if (e.key === 'F12') {
          e.preventDefault();
          this.recordViolation('devtools_key', 'critical',
            'Developer tools key pressed.');
        }

        /* Block copy/paste shortcuts */
        if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          this.recordViolation('copy_paste', 'high',
            `Copy/paste shortcut blocked (${e.ctrlKey ? 'Ctrl' : 'Meta'}+${e.key.toUpperCase()}).`);
        }

        /* Block PrintScreen */
        if (e.key === 'PrintScreen' || (e.key === 'PrtSc' && e.shiftKey)) {
          e.preventDefault();
          this.recordViolation('screenshot_attempt', 'critical',
            'Screenshot attempt blocked.');
        }

        if (e.ctrlKey || e.metaKey) {
          const blocked = {
            'c': 'Copy (Ctrl+C)',
            'v': 'Paste (Ctrl+V)',
            'x': 'Cut (Ctrl+X)',
            'a': 'Select all (Ctrl+A)',
            's': 'Save (Ctrl+S)',
            'p': 'Print (Ctrl+P)',
            'u': 'View source (Ctrl+U)',
          };

          const shiftBlocked = {
            'i': 'DevTools (Ctrl+Shift+I)',
            'j': 'Console (Ctrl+Shift+J)',
            'c': 'Inspect (Ctrl+Shift+C)',
          };

          if (e.shiftKey && shiftBlocked[e.key.toLowerCase()]) {
            e.preventDefault();
            this.recordViolation('devtools_shortcut', 'critical',
              `Pressed ${shiftBlocked[e.key.toLowerCase()]}.`);
            return;
          }

          const k = e.key.toLowerCase();
          if (blocked[k]) {
            /* Allow Ctrl+A inside inputs for text selection */
            if (k === 'a' && isInput) return;

            e.preventDefault();
            this.recordViolation('keyboard_blocked', 'medium',
              `Pressed ${blocked[k]}.`);
          }
        }
      }, true);

      /* ---- clipboard events ---- */
      for (const evt of ['copy', 'cut', 'paste']) {
        on(document, evt, e => {

      /* ---- right-click ---- */
      on(document, 'contextmenu', e => {
        if (!this.state.isStarted || this.state.isLocked) return;
        e.preventDefault();
        this.recordViolation('context_menu', 'low',
          'Right-click context menu blocked.');
      });

      /* ---- fullscreen exit ---- */
      on(document, 'fullscreenchange', () => {
        if (!document.fullscreenElement && this.state.isStarted &&
            !this.state.isLocked && !this.reenteringFS) {
          this.recordViolation('fullscreen_exit', 'high',
            'Exited fullscreen mode.');
          /* try to re-enter; if it fails, show a banner with a button */
          this.requestFullscreen();
        }
        /* hide banner when we're back in fullscreen */
        if (document.fullscreenElement) {
          this.hideFullscreenBanner();
        }
      });

      /* ---- beforeunload (warn, not violation) ---- */
      on(window, 'beforeunload', e => {
        if (this.state.isStarted && !this.state.isSubmitted && !this.state.isLocked) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }

    /* --------------------------------------------------
       GRACE-PERIOD MONITORS (prevents false positives)
       -------------------------------------------------- */
    _setupGracePeriodMonitors (on) {
      /* Handle visibilitychange with grace period */
      on(document, 'visibilitychange', () => {
        if (!this.state.isStarted || this.state.isLocked || this.isSubmitting) return;

        if (document.hidden) {
          /* Tab hidden - start grace period timer */
          this.lastFocusLossAt = Date.now();
          this.focusCheckTimer = setTimeout(() => {
            /* Grace period passed - still hidden, record violation */
            if (document.hidden && !this.isSubmitting) {
              this.recordViolation('tab_hidden', 'high',
                'Tab was hidden (switched tabs or minimised).');
            }
          }, this.GRACE_PERIOD_MS);
        } else {
          /* Tab became visible - cancel pending violation if within grace period */
          if (this.focusCheckTimer) {
            const elapsed = Date.now() - this.lastFocusLossAt;
            if (elapsed < this.GRACE_PERIOD_MS) {
              /* Event was short-lived - likely system popup, log as warning */
              this._logSuppressedEvent('tab_hidden', elapsed, 'System popup or brief blur');
            }
            clearTimeout(this.focusCheckTimer);
            this.focusCheckTimer = null;
          }
        }
      });

      /* Handle window blur with grace period */
      on(window, 'blur', () => {
        if (!this.state.isStarted || this.state.isLocked || this.reenteringFS || this.isSubmitting) return;

        /* Check if user was in a form input (suggests form popup vs intentional switch) */
        const activeElement = document.activeElement;
        const wasInInput = activeElement && (
          ['input', 'textarea', 'select'].includes(activeElement.tagName.toLowerCase()) ||
          activeElement.isContentEditable
        );

        this.lastBlurAt = Date.now();
        this.focusCheckTimer = setTimeout(() => {
          /* Grace period passed - check if still blurred and not submitting */
          if (!document.hasFocus() && !this.isSubmitting) {
            /* Still not focused after grace period - record violation */
            this.recordViolation('window_blur', 'high',
              'Window lost focus.');
          }
        }, wasInInput ? this.GRACE_PERIOD_MS * 2 : this.GRACE_PERIOD_MS);
      });

      /* Handle window focus - cancel pending blur violation */
      on(window, 'focus', () => {
        if (this.focusCheckTimer) {
          const elapsed = Date.now() - Math.max(this.lastFocusLossAt, this.lastBlurAt);
          if (elapsed < this.GRACE_PERIOD_MS || elapsed < this.GRACE_PERIOD_MS * 2) {
            /* Event was short-lived - likely system popup */
            this._logSuppressedEvent('window_blur', elapsed, 'System popup or brief blur');
          }
          clearTimeout(this.focusCheckTimer);
          this.focusCheckTimer = null;
        }
      });

      /* Network status check - suppress violations when offline */
      on(window, 'online', () => {
        if (this.focusCheckTimer) {
          /* Connection restored - check if we should still record violation */
          clearTimeout(this.focusCheckTimer);
          this.focusCheckTimer = null;
          this._logSuppressedEvent('network_related', 0, 'Connection restored - possible network suspension');
        }
      });
    }

    /* Log suppressed events for audit/debug purposes */
    _logSuppressedEvent (type, durationMs, reason) {
      /* Send to background as low-severity log (not violation) */
      bg({
        type : 'LOG_VIOLATION',
        data : {
          sessionId   : this.state.sessionId,
          studentName : this.state.studentName,
          studentEmail: this.state.studentEmail,
          formUrl     : location.href,
          violation   : `${type}_suppressed`,
          severity    : 'low',
          details     : `${type} suppressed: ${reason} (duration: ${durationMs}ms)`,
          timestamp   : new Date().toISOString(),
        },
      });
      console.log(`[CRC] ${type} suppressed: ${reason} (${durationMs}ms)`);
    }

    startDevtoolsCheck () {
      if (this.devtoolsInterval) clearInterval(this.devtoolsInterval);

      const threshold = 160;
      this.devtoolsInterval = setInterval(() => {
        if (!this.state.isStarted || this.state.isLocked) return;

        const widthDiff  = window.outerWidth  - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;

        if (widthDiff > threshold || heightDiff > threshold) {
          this.recordViolation('devtools_open', 'critical',
            'Developer tools appear to be open.');
        }
      }, CFG.DEVTOOLS_CHECK_MS);
    }

    /* --------------------------------------------------
       FULLSCREEN
       -------------------------------------------------- */
    requestFullscreen () {
      this.reenteringFS = true;
      const el = document.documentElement;
      const req =
        el.requestFullscreen       ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen;

      if (req) {
        /*
         * FIX: webkitRequestFullscreen returns undefined (not a Promise).
         * Wrap in Promise.resolve() so .then/.catch always work.
         */
        let result;
        try {
          result = req.call(el);
        } catch (e) {
          result = Promise.reject(e);
        }

        Promise.resolve(result)
          .then(() => {
            this.hideFullscreenBanner();
            this.reenteringFS = false; // Reset flag immediately after success
            console.log('[CRC] Fullscreen entered successfully');
          })
          .catch((err) => {
            console.error('[CRC] Fullscreen failed:', err);
            /* re-entry failed (no user gesture) — show banner */
            this.showFullscreenBanner();
            this.reenteringFS = false; // Reset flag even on failure
          });
      } else {
        console.error('[CRC] Fullscreen API not available');
        this.reenteringFS = false;
        this.showFullscreenBanner();
      }
    }

    /* --------------------------------------------------
       FULLSCREEN RE-ENTRY BANNER
       -------------------------------------------------- */
    showFullscreenBanner () {
      if (this.fullscreenBanner) return;

      const banner = document.createElement('div');
      banner.className = 'crc-fs-banner';
      banner.innerHTML = `
        <span class="crc-fs-banner__text">
          ⚠️ You exited fullscreen — this was logged as a violation.
        </span>
        <button class="crc-fs-banner__btn" id="crc-reenter-fs">
          ↩ Re-enter Fullscreen
        </button>`;

      document.body.appendChild(banner);
      this.fullscreenBanner = banner;

      banner.querySelector('#crc-reenter-fs').addEventListener('click', () => {
        this.requestFullscreen();
      });
    }

    hideFullscreenBanner () {
      if (this.fullscreenBanner) {
        this.fullscreenBanner.remove();
        this.fullscreenBanner = null;
      }
    }

    /* --------------------------------------------------
       FORM SUBMISSION DETECTION
       -------------------------------------------------- */
    watchForSubmission () {
      /* Method 1: MutationObserver watching for Google's confirmation text */
      const observer = new MutationObserver(() => {
        if (this.state.isSubmitted || this.state.isLocked) return;

        /* Google Forms shows a "Your response has been recorded" element */
        const body = document.body.innerText || '';
        if (
          body.includes('Your response has been recorded') ||
          body.includes('Your answer has been recorded')   ||
          body.includes('Thanks for your response')
        ) {
          this.handleFormSubmitted();
          observer.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true, subtree: true, characterData: true,
      });
      this.cleanups.push(() => observer.disconnect());

      /* Method 2: Listen for actual form submit events */
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        const handler = () => {
          /* Mark as submitting to suppress violations during submission */
          this.isSubmitting = true;
          /* Google Forms may replace content after submit;
             give it a moment then check. */
          setTimeout(() => {
            if (location.pathname.includes('/formResponse') ||
                location.search.includes('formResponse')) {
              this.handleFormSubmitted();
            }
            /* Reset submitting flag after the transition */
            this.isSubmitting = false;
          }, 3000);
        };
        form.addEventListener('submit', handler);
        this.cleanups.push(() => form.removeEventListener('submit', handler));
      });
    }

    handleFormSubmitted () {
      if (this.state.isSubmitted) return;

      this.state.isSubmitted = true;
      this.saveState();
      this.teardown();

      this.logEvent('exam_submitted', 'info',
        `${this.state.studentName} submitted their exam.`);
      bg({
        type      : 'END_SESSION',
        sessionId : this.state.sessionId,
        student   : this.state.studentName,
        studentEmail: this.state.studentEmail,
        durationMs  : this.getExamDurationMs(),
        reason    : 'submitted',
      }, (resp) => {
        if (!resp || !resp.ok) {
          console.error('[CRC] END_SESSION error:', resp?.error);
          this.showToast('Failed to finalize session. Please contact support.', 'error');
        } else {
          this.showToast('Session finalized. A violation report will be emailed if any violations occurred.', 'info');
        }
      });
      // Removed showSubmitted call - function was deleted
    }

    /* --------------------------------------------------
       TEARDOWN (stop monitoring, clean up listeners)
       -------------------------------------------------- */
    teardown () {
      if (this.timerInterval) clearInterval(this.timerInterval);
      if (this.devtoolsInterval) clearInterval(this.devtoolsInterval);
      if (this.cleanups && Array.isArray(this.cleanups)) {
        this.cleanups.forEach(fn => { try { fn(); } catch (e) { console.error('[CRC] Cleanup error:', e); } });
      }
      this.cleanups = [];

      /* tell background exam is no longer active */
      bg({ type: 'EXAM_INACTIVE' });
    }
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CRCExamLockdown());
  } else {
    new CRCExamLockdown();
  }
})();
