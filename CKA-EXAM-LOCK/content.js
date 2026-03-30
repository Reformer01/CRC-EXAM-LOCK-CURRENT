/* ============================================================
   CKA Exam Lockdown — Content Script
   Only injected on Google Forms viewform / formResponse pages.
   ============================================================ */
(function () {
  'use strict';

  /* ---- guard against double-injection ---- */
  if (window.__ckaExamLockLoaded) return;
  window.__ckaExamLockLoaded = true;

  /* ==========================================================
     CONFIG
     ========================================================== */
  const CFG = Object.freeze({
    EXAM_DURATION_MS : 2 * 60 * 60 * 1000,   // 2 hours
    MAX_VIOLATIONS   : 4,
    SCHOOL_NAME      : 'CKA',
    COOLDOWN_MS      : 2000,                  // per-type cooldown
    TOAST_DURATION   : 4000,
    DEVTOOLS_CHECK_MS: 3000,
    /* Google Sheets webhook — replace after deploying GoogleSheetsScript.gs */
    WEBHOOK_URL      : 'https://script.google.com/macros/s/AKfycbx_DIVOKWf_MN5bsDama2HfBFRPlIWc8lgmOa93Z20bvoHEpsyOyLZgDILh1xk0SEDT/exec',
  });

  /* ==========================================================
     HELPERS
     ========================================================== */

  /** Extract a stable form-ID from the current URL for storage keying. */
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
    return 'cka_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }

  /** Safe chrome.storage.local get. */
  function storageGet (key) {
    return new Promise(resolve => {
      try { chrome.storage.local.get([key], r => resolve(r[key])); }
      catch { resolve(undefined); }
    });
  }

  /** Safe chrome.storage.local set. */
  function storageSet (obj) {
    return new Promise(resolve => {
      try { chrome.storage.local.set(obj, resolve); }
      catch { resolve(); }
    });
  }

  /** Send a message to the background service-worker. */
  function bg (msg) {
    try { chrome.runtime.sendMessage(msg); } catch { /* context invalid */ }
  }

  /* ==========================================================
     MAIN CLASS
     ========================================================== */
  class CKAExamLockdown {
    constructor () {
      this.FORM_ID     = formId();
      this.STORAGE_KEY = `ckaSession_${this.FORM_ID}`;

      /* runtime state — will be hydrated from storage */
      this.state = {
        sessionId      : null,
        studentName    : '',
        startTime      : null,
        violationCount : 0,
        isStarted      : false,
        isSubmitted    : false,
        isLocked       : false,
        violations     : [],
      };

      /* UI handles */
      this.timerEl           = null;
      this.violationBadgeEl  = null;
      this.overlayEl         = null;
      this.fullscreenBanner  = null;

      /* cooldown map: violationType → lastFiredTimestamp */
      this.cooldowns = {};

      /* timer interval id */
      this.timerInterval = null;

      /* devtools detection interval */
      this.devtoolsInterval = null;

      /* whether we are in the middle of re-entering fullscreen */
      this.reenteringFS = false;

      /* list of cleanup functions for event listeners */
      this.cleanups = [];

      this.isResponsePage =
        location.pathname.includes('/formResponse') ||
        location.search.includes('formResponse');

      this.init();
    }

    /* --------------------------------------------------
       INIT
       -------------------------------------------------- */
    async init () {
      await this.loadState();

      if (this.isResponsePage) {
        return this.handleResponsePage();
      }

      if (this.state.isLocked) {
        return this.showLockout('Your exam has been locked due to violations.');
      }

      if (this.state.isSubmitted) {
        return this.showSubmitted();
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

    /* --------------------------------------------------
       STATE PERSISTENCE
       -------------------------------------------------- */
    async loadState () {
      const saved = await storageGet(this.STORAGE_KEY);
      if (saved) Object.assign(this.state, saved);
    }

    async saveState () {
      await storageSet({ [this.STORAGE_KEY]: { ...this.state } });
    }

    /* --------------------------------------------------
       TIME HELPERS
       -------------------------------------------------- */
    getRemainingMs () {
      if (!this.state.startTime) return CFG.EXAM_DURATION_MS;
      return Math.max(0,
        CFG.EXAM_DURATION_MS - (Date.now() - this.state.startTime));
    }

    /* --------------------------------------------------
       OVERLAYS  (setup · lockout · submitted)
       -------------------------------------------------- */

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
      overlay.className = 'cka-overlay';
      overlay.innerHTML = `
        <div class="cka-card">
          <div class="cka-card-icon cka-card-icon--blue">🛡️</div>
          <h2>${CFG.SCHOOL_NAME} Exam Lockdown</h2>
          <p>
            This exam is proctored. You have <strong>2 hours</strong> to complete it.
            Tab-switching, copy-paste and developer tools are not allowed.
          </p>
          <input
            id="cka-name-input"
            class="cka-input"
            type="text"
            placeholder="Enter your full name"
            autocomplete="off"
            spellcheck="false"
          />
          <div id="cka-name-error" class="cka-error" style="display:none"></div>
          <button id="cka-start-btn" class="cka-btn cka-btn--primary">
            🚀&ensp;Start Exam
          </button>
          <div class="cka-brand">${CFG.SCHOOL_NAME} EXAM PROCTORING SYSTEM</div>
        </div>`;

      document.body.appendChild(overlay);
      this.overlayEl = overlay;

      const input = overlay.querySelector('#cka-name-input');
      const btn   = overlay.querySelector('#cka-start-btn');
      const err   = overlay.querySelector('#cka-name-error');

      btn.addEventListener('click', () => {
        const name = input.value.trim();
        if (name.length < 2) {
          err.textContent = 'Please enter your full name (at least 2 characters).';
          err.style.display = 'block';
          input.focus();
          return;
        }
        this.beginExam(name);
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
      overlay.className = 'cka-overlay';
      overlay.innerHTML = `
        <div class="cka-card">
          <div class="cka-card-icon cka-card-icon--red">🚫</div>
          <h2>Exam Locked</h2>
          <p>${reason}</p>
          <p style="font-size:13px;color:#64748b;">
            Contact your invigilator for assistance.<br>
            Student: <strong>${this.state.studentName}</strong><br>
            Violations: <strong>${this.state.violationCount} / ${CFG.MAX_VIOLATIONS}</strong>
          </p>
          <div class="cka-brand">${CFG.SCHOOL_NAME} EXAM PROCTORING SYSTEM</div>
        </div>`;
      document.body.appendChild(overlay);
      this.overlayEl = overlay;
    }

    /** Confirmation overlay after form submission. */
    showSubmitted () {
      this.clearOverlay();
      this.removeTimer();

      const overlay = document.createElement('div');
      overlay.className = 'cka-overlay';
      overlay.innerHTML = `
        <div class="cka-card">
          <div class="cka-card-icon cka-card-icon--green">✅</div>
          <h2>Exam Submitted</h2>
          <p>
            Your responses have been recorded.<br>
            You may now close this tab.
          </p>
          <p style="font-size:13px;color:#64748b;">
            Student: <strong>${this.state.studentName}</strong>
          </p>
          <div class="cka-brand">${CFG.SCHOOL_NAME} EXAM PROCTORING SYSTEM</div>
        </div>`;
      document.body.appendChild(overlay);
      this.overlayEl = overlay;
    }

    /* --------------------------------------------------
       RESPONSE PAGE
       -------------------------------------------------- */
    handleResponsePage () {
      /* Mark session as submitted (if one exists) */
      if (this.state.isStarted && !this.state.isSubmitted) {
        this.state.isSubmitted = true;
        this.saveState();
        this.logEvent('exam_submitted', 'info',
          'Student submitted their form.');
      }
      this.showSubmitted();
    }

    /* --------------------------------------------------
       BEGIN / RESUME EXAM
       -------------------------------------------------- */
    beginExam (name) {
      this.state.sessionId      = genId();
      this.state.studentName    = name;
      this.state.startTime      = Date.now();
      this.state.isStarted      = true;
      this.state.violationCount = 0;
      this.state.isSubmitted    = false;
      this.state.isLocked       = false;
      this.state.violations     = [];

      this.saveState();
      this.clearOverlay();

      /* Log session start */
      this.logEvent('exam_started', 'info',
        `Exam started by ${name}. Duration: 2 hours.`);
      bg({
        type : 'LOG_SESSION',
        data : {
          sessionId   : this.state.sessionId,
          studentName : name,
          formUrl     : location.href,
          startTime   : new Date(this.state.startTime).toISOString(),
        },
      });

      this.activateExamMode();
    }

    resumeExam () {
      this.clearOverlay();
      this.activateExamMode();
    }

    /** Shared activation logic for both begin and resume. */
    activateExamMode () {
      this.createTimerUI();
      this.createViolationBadge();
      this.startTimer();
      this.attachMonitors();
      this.requestFullscreen();
      this.startDevtoolsCheck();
      this.watchForSubmission();

      /* tell background this tab has an active exam */
      bg({
        type      : 'EXAM_ACTIVE',
        sessionId : this.state.sessionId,
        student   : this.state.studentName,
      });
    }

    /* --------------------------------------------------
       TIMER UI + LOGIC
       -------------------------------------------------- */
    createTimerUI () {
      if (this.timerEl) return;
      const el = document.createElement('div');
      el.className = 'cka-timer cka-timer--green';
      el.innerHTML = '<span class="cka-timer-icon">⏱️</span><span id="cka-time-text"></span>';
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
      const text = this.timerEl.querySelector('#cka-time-text');
      if (text) text.textContent = fmtTime(remaining);

      /* colour classes */
      const mins = remaining / 60000;
      this.timerEl.className = 'cka-timer ' + (
        mins > 30   ? 'cka-timer--green'  :
        mins > 15   ? 'cka-timer--yellow' :
        mins >  5   ? 'cka-timer--orange' :
                      'cka-timer--red cka-timer--pulse'
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
      this.logEvent('time_expired', 'critical',
        'Exam time (2 hours) has expired.');
      bg({
        type      : 'END_SESSION',
        sessionId : this.state.sessionId,
        student   : this.state.studentName,
        reason    : 'time_expired',
      });
      this.showLockout(
        'Your exam time of 2 hours has expired. The exam is now locked.'
      );
    }

    /* --------------------------------------------------
       VIOLATION BADGE
       -------------------------------------------------- */
    createViolationBadge () {
      if (this.violationBadgeEl) return;
      const el = document.createElement('div');
      el.className = 'cka-violation-badge';
      document.body.appendChild(el);
      this.violationBadgeEl = el;
      this.updateViolationBadge();
    }

    updateViolationBadge () {
      if (!this.violationBadgeEl) return;
      const c = this.state.violationCount;
      this.violationBadgeEl.textContent = `⚠️ Violations: ${c} / ${CFG.MAX_VIOLATIONS}`;
      this.violationBadgeEl.className = 'cka-violation-badge' +
        (c >= 3 ? ' cka-violation-badge--danger' :
         c >= 2 ? ' cka-violation-badge--warn' : '');
    }

    /* --------------------------------------------------
       TOAST NOTIFICATIONS
       -------------------------------------------------- */
    showToast (message, level = 'warning') {
      const t = document.createElement('div');
      t.className = `cka-toast cka-toast--${level}`;
      t.textContent = message;
      document.body.appendChild(t);
      setTimeout(() => {
        t.classList.add('cka-toast--exit');
        setTimeout(() => t.remove(), 350);
      }, CFG.TOAST_DURATION);
    }

    /* --------------------------------------------------
       VIOLATION RECORDING
       -------------------------------------------------- */
    recordViolation (type, severity, details) {
      /* enforce cooldown */
      const now = Date.now();
      if (this.cooldowns[type] && now - this.cooldowns[type] < CFG.COOLDOWN_MS) {
        return;
      }
      this.cooldowns[type] = now;

      this.state.violationCount++;
      this.state.violations.push({
        type, severity, details, timestamp: now,
      });
      this.saveState();
      this.updateViolationBadge();

      this.showToast(
        `⚠️ Violation ${this.state.violationCount}/${CFG.MAX_VIOLATIONS}: ${details}`,
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
          reason    : 'max_violations',
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
          formUrl     : location.href,
          violation   : type,
          severity    : severity,
          details     : details,
          timestamp   : new Date().toISOString(),
        },
      });
    }

    /* --------------------------------------------------
       MONITORS
       -------------------------------------------------- */
    attachMonitors () {
      const on = (target, evt, fn, opts) => {
        target.addEventListener(evt, fn, opts);
        this.cleanups.push(() => target.removeEventListener(evt, fn, opts));
      };

      /* ---- visibility / blur ---- */
      on(document, 'visibilitychange', () => {
        if (document.hidden && this.state.isStarted && !this.state.isLocked) {
          this.recordViolation('tab_hidden', 'high',
            'Tab was hidden (switched tabs or minimised).');
        }
      });

      on(window, 'blur', () => {
        if (this.state.isStarted && !this.state.isLocked && !this.reenteringFS) {
          this.recordViolation('window_blur', 'high',
            'Window lost focus.');
        }
      });

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
            'Pressed F12 (developer tools).');
          return;
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
          if (!this.state.isStarted || this.state.isLocked) return;
          e.preventDefault();
          this.recordViolation(`clipboard_${evt}`, 'medium',
            `Attempted to ${evt}.`);
        }, true);
      }

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
       DEVTOOLS SIZE-BASED DETECTION
       -------------------------------------------------- */
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
          })
          .catch(() => {
            /* re-entry failed (no user gesture) — show banner */
            this.showFullscreenBanner();
          })
          .finally(() => {
            setTimeout(() => { this.reenteringFS = false; }, 500);
          });
      } else {
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
      banner.className = 'cka-fs-banner';
      banner.innerHTML = `
        <span class="cka-fs-banner__text">
          ⚠️ You exited fullscreen — this was logged as a violation.
        </span>
        <button class="cka-fs-banner__btn" id="cka-reenter-fs">
          ↩ Re-enter Fullscreen
        </button>`;

      document.body.appendChild(banner);
      this.fullscreenBanner = banner;

      banner.querySelector('#cka-reenter-fs').addEventListener('click', () => {
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
          /* Google Forms may replace content after submit;
             give it a moment then check. */
          setTimeout(() => {
            if (location.pathname.includes('/formResponse') ||
                location.search.includes('formResponse')) {
              this.handleFormSubmitted();
            }
          }, 2000);
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
        reason    : 'submitted',
      });
      this.showSubmitted();
    }

    /* --------------------------------------------------
       TEARDOWN (stop monitoring, clean up listeners)
       -------------------------------------------------- */
    teardown () {
      if (this.timerInterval) clearInterval(this.timerInterval);
      if (this.devtoolsInterval) clearInterval(this.devtoolsInterval);
      this.cleanups.forEach(fn => { try { fn(); } catch {} });
      this.cleanups = [];

      /* tell background exam is no longer active */
      bg({ type: 'EXAM_INACTIVE' });
    }
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CKAExamLockdown());
  } else {
    new CKAExamLockdown();
  }
})();
