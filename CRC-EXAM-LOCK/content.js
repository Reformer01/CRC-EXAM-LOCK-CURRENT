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
    RECONCILE_MS     : 60000,                 // server re-verification interval
    HIDDEN_GRACE_MS      : 400,               // tab must stay hidden this long before it counts
    BLUR_GRACE_MS        : 2000,              // visible-but-unfocused must persist this long
    SYSTEM_TOAST_THROTTLE_MS : 45000,         // how often "system interruption" info toasts appear
    SUPPRESS_LOG_THROTTLE_MS  : 30000,        // how often suppressed events are written to the audit log

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

  /** Ordinal suffix for a number (1st, 2nd, 3rd, 4th…). */
  function ordinal (n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return n + 'th';
    const mod10 = n % 10;
    return n + (mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th');
  }

  /** Generate a short random session ID. */
  function genId () {
    return 'crc_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 8);
  }

  /** FNV-1a checksum over the tamper-sensitive session fields. */
  function stateSignature (s) {
    const str = [
      s.sessionId, s.studentName, s.studentEmail, s.formId,
      s.startTime, s.durationMs, s.violationCount,
      s.isStarted, s.isSubmitted, s.isLocked, s.pendingSubmit,
    ].join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  /** Sanity-check session fields against obvious manipulation. */
  function validateState (s) {
    if (!s || typeof s !== 'object') return false;
    if (!s.isStarted) return true; // pre-start state needs no session fields
    if (typeof s.sessionId !== 'string' || !/^crc_[0-9a-z]+_[0-9a-z]+$/.test(s.sessionId)) return false;
    if (!Number.isFinite(s.startTime) || s.startTime <= 0 ||
        s.startTime > Date.now() + 5 * 60 * 1000) return false; // future start = clock rollback
    const d = Number(s.durationMs);
    if (!(d >= 10 * 60 * 1000 && d <= 8 * 60 * 60 * 1000)) return false;
    if (!Number.isInteger(s.violationCount) || s.violationCount < 0 ||
        s.violationCount > 100) return false;
    return true;
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

  /* ---- Violation audio cue (no asset files, generated Web Audio) ---- */
  /* Browsers only let audio start after a user gesture, so the context is
     created lazily on the first pointer/key/click interaction and reused.
     Everything is guarded: no audio hardware or API means silent no-ops,
     never an error in the violation path. */
  let audioCtx = null;

  function unlockAudio () {
    try {
      if (audioCtx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (typeof AC !== 'function') return;
      audioCtx = new AC();
      if (audioCtx && audioCtx.resume) audioCtx.resume().catch(() => {});
    } catch (err) {
      audioCtx = null;
    }
  }

  function playViolationCue (count) {
    try {
      if (!audioCtx || typeof audioCtx.currentTime !== 'number') return;
      /* soft two-tone blip: gentle early on, slightly lower and a touch
         louder as the student nears the lock threshold — never a siren */
      const urgent = count >= CFG.MAX_VIOLATIONS - 1;
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(urgent ? 523.25 : 659.25, t0);
      osc.frequency.setValueAtTime(urgent ? 392.0 : 523.25, t0 + 0.09);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.09 : 0.06, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    } catch (err) {
      /* audio unavailable — the visual/toast/live-region cues still fired */
    }
  }

  /* unlock on the student's first real interaction (covers resume-after-
     reload, which never passes through the Start button) */
  const unlockOnFirstGesture = () => {
    unlockAudio();
    try {
      window.removeEventListener('pointerdown', unlockOnFirstGesture);
      window.removeEventListener('keydown', unlockOnFirstGesture);
    } catch { /* ignore */ }
  };
  try {
    window.addEventListener('pointerdown', unlockOnFirstGesture);
    window.addEventListener('keydown', unlockOnFirstGesture);
  } catch { /* ignore */ }

  /* Toast stacking (R-D fix): toasts are stacked under the top-right corner
     instead of rendered on top of each other. Positions are measured so a
     taller toast (wrapped text, action button) never overlaps its neighbour. */
  const TOAST_START_TOP = 80;
  const TOAST_GAP = 10;

  function relayoutToasts () {
    const kids = document.body && document.body.children;
    if (!kids) return;
    const toasts = Array.prototype.filter.call(kids, el =>
      String(el.className || '').indexOf('crc-toast') === 0);
    let y = TOAST_START_TOP;
    for (let i = 0; i < toasts.length; i++) {
      toasts[i].style.top = `${y}px`;
      /* offsetHeight is real in the browser; the 72px fallback keeps the
         stub DOM (no layout) deterministic too */
      y += (toasts[i].offsetHeight || 72) + TOAST_GAP;
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
        pendingSubmit  : false,
        isLocked       : false,
        formId         : '',
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

      /* listeners registered by attachMonitors/watchForSubmission
         (removed on teardown) — MUST be initialized here, otherwise
         attachMonitors() throws and exam monitoring never starts */
      this.cleanups = [];

      /* submission watcher — kept alive across lockouts so a late
         confirmation can still finalize the session */
      this.submitObserver = null;

      /* set when local session state fails integrity checks */
      this.stateTampered = false;

      /* periodic server re-verification (clock rollback / tampering) */
      this.reconcileInterval = null;

      /* whether we are in the middle of re-entering fullscreen */
      this.reenteringFS = false;

      /* attention-loss detection: hidden + blur tracked with separate
         timers so a real tab switch never double-counts and system
         notifications are never counted as violations */
      this.isSubmitting       = false;
      this.hiddenCheckTimer   = null;
      this.blurCheckTimer     = null;
      this.lastHiddenAt       = 0;
      this.lastBlurAt         = 0;

      /* fullscreen-exit classification: timestamp of an Esc/F11 keydown
         (user-initiated) vs system-forced exits */
      this.fullscreenExitIntent = 0;
      this.fullscreenExitCounted = true;

      /* throttles for system-interruption feedback */
      this.lastSystemToastAt  = 0;
      this.lastSuppressLogAt  = 0;

      /* positive-reinforcement milestones already shown (25%/50% time) */
      this.milestonesShown = new Set();

      /* pre-submit checklist shown once in the final minutes */
      this.finalStretchShown = false;

      this.isResponsePage =
        location.pathname.includes('/formResponse') ||
        location.search.includes('formResponse');

      /* answer popup status queries with live state */
      try {
        EXT?.runtime?.onMessage?.addListener?.((msg, _sender, sendResponse) => {
          if (msg && msg.type === 'GET_LIVE_STATUS') {
            sendResponse({
              isStarted      : this.state.isStarted,
              isSubmitted    : this.state.isSubmitted,
              isLocked       : this.state.isLocked,
              violationCount : this.state.violationCount,
              remainingMs    : this.state.isStarted ? this.getRemainingMs() : null,
            });
          }
        });
      } catch { /* context not ready */ }

      this.init();
    }


    async init () {
      await this.loadState();

      /* state failed integrity checks and could not be recovered */
      if (this.stateTampered) {
        this.showLockout(
          'Your session failed an integrity check. Contact your invigilator to continue.'
        );
        this.logEvent('state_tampered', 'critical',
          'Local session state failed integrity validation.');
        return;
      }

      if (this.isResponsePage) {
        return this.handleResponsePage();
      }

      /* a session is bound to one form — never resume it on another */
      if (this.state.isStarted && this.state.formId &&
          this.state.formId !== this.FORM_ID) {
        return this.showSetup();
      }

      if (this.state.isLocked) {
        this.markFinal('locked');
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
      if (!saved) return;

      let parsed = null;
      try {
        parsed = (typeof saved === 'string') ? JSON.parse(saved) : saved;
      } catch { /* bad JSON → handled as tampered below */ }

      if (!parsed || typeof parsed !== 'object') {
        this.stateTampered = true;
        return;
      }

      const sig = parsed._sig;
      const valid = validateState(parsed);

      if (sig && valid && sig === stateSignature(parsed)) {
        this.state = { ...this.state, ...parsed };
        return;
      }

      if (!sig && valid) {
        /* state saved by an older version — accept, re-sign on next save */
        this.state = { ...this.state, ...parsed };
        console.warn('[CRC] State without integrity signature (upgrade).');
        return;
      }

      /* tampered or corrupt — attempt server recovery before locking */
      console.warn('[CRC] State failed integrity check — attempting server recovery.');
      this.state = { ...this.state, ...parsed };
      const recovered = await this.tryRecoverFromServer();
      if (!recovered) {
        this.stateTampered = true;
      }
    }

    async saveState () {
      const toStore = { ...this.state };
      toStore._sig = stateSignature(this.state);
      await storageSet({ [this.STORAGE_KEY]: JSON.stringify(toStore) });
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
          <h1 id="crc-setup-title">${CFG.SCHOOL_NAME} Exam Lockdown</h1>
          <p>
            This exam is proctored, and you have <strong>limited time</strong> to complete it.
          </p>
          <div class="crc-rules">
            <h2 class="crc-rules__title" id="crc-rules-heading">How this exam works</h2>
            <ul>
              <li>🖥️ Stay in <b>this tab</b>, in <b>fullscreen</b> — switching away is flagged.</li>
              <li>🚫 No <b>copy/paste</b>, <b>right-click</b>, or <b>developer tools</b>.</li>
              <li>⚠️ The <b>4th violation</b> locks your exam — your invigilator reviews every flag and can unlock it.</li>
              <li class="crc-rules--safe">🔔 System alerts (low battery, meetings) are <b>never</b> counted against you.</li>
            </ul>
          </div>
          <label class="crc-sr-only" for="crc-name-input">Full name</label>
          <input
            id="crc-name-input"
            class="crc-input"
            type="text"
            placeholder="Enter your full name"
            autocomplete="off"
            spellcheck="false"
          />
          <label class="crc-sr-only" for="crc-email-input">Email address</label>
          <input
            id="crc-email-input"
            class="crc-input"
            type="email"
            placeholder="Enter your email"
            autocomplete="off"
            spellcheck="false"
          />
          <label class="crc-sr-only" for="crc-duration-input">Exam duration</label>
          <select id="crc-duration-input" class="crc-input">
            <option value="1800000">30 minutes</option>
            <option value="2700000">45 minutes</option>
            <option value="3600000">60 minutes</option>
            <option value="5400000">90 minutes</option>
            <option value="7200000" selected>120 minutes</option>
          </select>
          <div id="crc-name-error" class="crc-error" style="display:none" role="alert"></div>
          <button id="crc-start-btn" class="crc-btn crc-btn--primary">
            ✅&ensp;I understand — Start Exam
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

      btn.addEventListener('click', async () => {
        unlockAudio(); // the click is a user gesture — start audio now
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

        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Checking for an existing session…';
        try {
          /* anti-bypass: resume an active session already on the server
             instead of silently starting a competing one */
          const existing = await this.findActiveSession(mail, location.href);
          if (existing && existing.ok && existing.found && existing.session) {
            await this.rebuildFromServer(existing.session);
            return;
          }
          await this.beginExam(name, mail, durationMs);
        } catch (ex) {
          console.error('[CRC] Failed to start exam:', ex);
          err.textContent = 'Could not start the exam. Please try again.';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') btn.click();
      });

      /* pre-select the exam's configured default duration, if the server
         has one, unless the proctor already made a choice */
      let durationTouched = false;
      dur.addEventListener('change', () => { durationTouched = true; });
      this.fetchExamDefault().then(defaultMs => {
        if (!defaultMs || durationTouched || !this.overlayEl) return;
        const select = this.overlayEl.querySelector('#crc-duration-input');
        if (!select || String(select.value) === String(defaultMs)) return;
        const opt = document.createElement('option');
        opt.value = String(defaultMs);
        opt.textContent = `${Math.round(defaultMs / 60000)} minutes (exam default)`;
        select.appendChild(opt);
        select.value = String(defaultMs);
      });

      input.focus();
    }

    /** Lockout overlay (violations exceeded or time expired). */
    showLockout (reason) {
      this.clearOverlay();
      this.removeTimer();

      const overlay = document.createElement('div');
      overlay.className = 'crc-overlay';
      /* announce the lockout to screen readers the moment it appears */
      overlay.setAttribute('role', 'alert');
      overlay.innerHTML = `
        <div class="crc-card">
          <div class="crc-card-icon crc-card-icon--red">🚫</div>
          <h1 id="crc-lockout-title" tabindex="-1">Exam Locked</h1>
          <p>${reason}</p>
          <p class="crc-lockout-help">
            Contact your invigilator for assistance.<br>
            Student: <strong>${this.state.studentName}</strong><br>
            Violations: <strong>${this.state.violationCount} of ${CFG.MAX_VIOLATIONS}</strong>
          </p>
          <div class="crc-brand">${CFG.SCHOOL_NAME} EXAM PROCTORING SYSTEM</div>
        </div>`;
      document.body.appendChild(overlay);
      this.overlayEl = overlay;
      /* move keyboard focus to the lockout heading so keyboard and
         screen-reader users land on the announcement, not the covered form */
      const lockoutTitle = overlay.querySelector('#crc-lockout-title');
      if (lockoutTitle) lockoutTitle.focus();
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

    /** Tell the background this session ended in a final state (locked or
        submitted) so the popup can still report it after teardown clears
        the active-session record (R-A fix). */
    markFinal (status) {
      bg({
        type         : 'SESSION_FINAL',
        sessionId    : this.state.sessionId,
        student      : this.state.studentName,
        studentEmail : this.state.studentEmail,
        status       : status,
      });
    }

    stopUnlockPolling () {
      if (this.unlockPollInterval) {
        clearInterval(this.unlockPollInterval);
        this.unlockPollInterval = null;
      }
    }

    /* ==================================================
       SERVER RECONCILIATION (anti-tamper / anti-bypass)
       ================================================== */

    /** GET session_status from the webhook backend. */
    async fetchSessionStatus (sessionId) {
      if (!sessionId || !CFG.WEBHOOK_URL ||
          CFG.WEBHOOK_URL === 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE') return null;
      try {
        const url = new URL(CFG.WEBHOOK_URL);
        url.searchParams.set('action', 'session_status');
        url.searchParams.set('sessionId', sessionId);
        const resp = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
        return await resp.json().catch(() => null);
      } catch { return null; }
    }

    /** GET find_session — active session for this student + form. */
    async findActiveSession (email, formUrl) {
      if (!email || !CFG.WEBHOOK_URL ||
          CFG.WEBHOOK_URL === 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE') return null;
      try {
        const url = new URL(CFG.WEBHOOK_URL);
        url.searchParams.set('action', 'find_session');
        url.searchParams.set('email', email);
        url.searchParams.set('formUrl', formUrl);
        const resp = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
        return await resp.json().catch(() => null);
      } catch { return null; }
    }

    /** GET exam_default — the configured duration for this exam. */
    async fetchExamDefault () {
      if (!CFG.WEBHOOK_URL || CFG.WEBHOOK_URL === 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE') return null;
      try {
        const url = new URL(CFG.WEBHOOK_URL);
        url.searchParams.set('action', 'exam_default');
        url.searchParams.set('formUrl', location.href);
        const resp = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
        const data = await resp.json().catch(() => null);
        if (!data || !data.ok || !data.found) return null;
        const d = Number(data.durationMs);
        if (!(d >= 10 * 60 * 1000 && d <= 8 * 60 * 60 * 1000)) return null;
        return d;
      } catch { return null; }
    }

    /** Overwrite local state with the server's authoritative session data. */
    applyServerSession (s) {
      const start = new Date(s.startTime).getTime();
      this.state.sessionId      = s.sessionId;
      this.state.studentName    = s.studentName || '';
      this.state.studentEmail   = s.studentEmail || '';
      this.state.formId         = this.FORM_ID;
      this.state.durationMs     = Number(s.durationMs) > 0
        ? Number(s.durationMs) : (this.state.durationMs || CFG.EXAM_DURATION_MS);
      this.state.startTime      = Number.isFinite(start) ? start : Date.now();
      this.state.violationCount = Math.max(0, Number(s.violationCount) || 0);
      this.state.isStarted      = true;
      this.state.isSubmitted    = false;
      this.state.pendingSubmit  = false;
      this.state.isLocked       = false;
      this.state.violations     = [];
      if (s.status === 'Submitted') this.state.isSubmitted = true;
      if (s.status === 'Locked (Violations)') this.state.isLocked = true;
    }

    /** Rebuild local state from a server session and continue the exam. */
    async rebuildFromServer (s) {
      this.applyServerSession(s);
      await this.saveState();
      this.clearOverlay();
      this.showToast('Existing session found — resuming your exam.', 'info');
      this.resumeExam();
    }

    /** Recover a tampered/corrupt local state from the server, if possible. */
    async tryRecoverFromServer () {
      if (this.state.sessionId) {
        const data = await this.fetchSessionStatus(this.state.sessionId);
        if (data && data.ok && data.found) {
          this.applyServerSession(data);
          await this.saveState();
          this.logEvent('state_recovered', 'low',
            'State recovered from server after integrity failure.');
          return true;
        }
      }
      if (this.state.studentEmail) {
        const f = await this.findActiveSession(this.state.studentEmail, location.href);
        if (f && f.ok && f.found && f.session) {
          this.applyServerSession(f.session);
          await this.saveState();
          this.logEvent('state_recovered', 'low',
            'State recovered via find_session after integrity failure.');
          return true;
        }
      }
      return false;
    }

    /**
     * Re-verify the session against the server: adopt the server start
     * time (blocks clock rollback), adopt a higher violation count
     * (blocks local state editing), and enforce server lock/submit state.
     */
    async reconcileWithServer () {
      if (!this.state.isStarted || this.state.isSubmitted) return;
      if (this.isSubmitting || this.state.pendingSubmit) return;
      if (this._reconcileInFlight) return; // never stack reconciles (focus + interval)
      this._reconcileInFlight = true;
      try {
        const data = await this.fetchSessionStatus(this.state.sessionId);
        if (!data || !data.ok || !data.found) return; // offline/unknown → keep local

        let changed = false;

        if (data.startTime) {
          const t = new Date(data.startTime).getTime();
          if (Number.isFinite(t) && Math.abs(t - this.state.startTime) > 60000) {
            this.state.startTime = t;
            changed = true;
            if (this.timerEl) this.updateTimerDisplay();
          }
        }

        /* adopt a server-side duration change (admin bulk update or a
           mid-exam time grant). The start time stays put, so extending
           mid-exam extends the clock and shortening it rolls the clock
           back. Changes of a full minute or more count, so a 1-minute
           grant is adopted too; the timer speaks the rest. */
        if (data.durationMs) {
          const d = Number(data.durationMs);
          if (Number.isInteger(d) &&
              d >= 10 * 60 * 1000 && d <= 8 * 60 * 60 * 1000 &&
              Math.abs(d - this.state.durationMs) >= 60000) {
            this.state.durationMs = d;
            changed = true;
            if (this.timerEl) this.updateTimerDisplay();
            this.showToast(
              `Your exam time was updated to ${Math.round(d / 60000)} minutes.`,
              'info'
            );
          }
        }

        const serverCount = Number(data.violationCount);
        if (data.clearedAt && data.clearedAt !== this.state.lastClearedAt) {
          /* an admin cleared this session — server count is authoritative */
          this.state.lastClearedAt = data.clearedAt;
          this.state.violationCount = Math.max(0, serverCount || 0);
          changed = true;
        } else if (Number.isInteger(serverCount) &&
                   serverCount > this.state.violationCount) {
          /* server knows of more violations than we do (state was edited) */
          this.state.violationCount = serverCount;
          changed = true;
        }
        if (changed && this.violationBadgeEl) this.updateViolationBadge();

        const status = String(data.status || '');

        /* A submitted exam stays submitted — check before the lock branch,
           since a row can carry both a high violation count and a final
           Submitted status. */
        if (status === 'Submitted') {
          this.state.isSubmitted = true;
          this.state.pendingSubmit = false;
          await this.saveState();
          this.markFinal('submitted');
          this.teardown();
          this.showToast('Your exam was recorded as submitted.', 'info');
          return;
        }
        /* Enforce the server lock on BOTH signals: an explicit locked status,
           or a violation count at the max. The count-only case matters when
           the lockout END_SESSION was lost in transit (row still Active but
           count already at the limit) — without it, a reload right after the
           4th violation would let the exam continue past the maximum.
           Admin unlocks (data.unlocked) always win. */
        if ((status === 'Locked (Violations)' ||
             this.state.violationCount >= CFG.MAX_VIOLATIONS) && !data.unlocked) {
          this.state.isLocked = true;
          await this.saveState();
          this.markFinal('locked');
          this.teardown();
          this.showLockout('Your exam has been locked due to violations.');
          this.startUnlockPolling();
          return;
        }

        if (changed) await this.saveState();
      } finally {
        this._reconcileInFlight = false;
      }
    }

    startReconcileInterval () {
      this.stopReconcileInterval();
      this.reconcileInterval = setInterval(
        () => this.reconcileWithServer(), CFG.RECONCILE_MS);
    }

    stopReconcileInterval () {
      if (this.reconcileInterval) {
        clearInterval(this.reconcileInterval);
        this.reconcileInterval = null;
      }
    }

    /** Register the session with the backend; resolves with its response. */
    sendLogSession (sessionId, name, email, durationMs) {
      return new Promise(resolve => {
        let settled = false;
        const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
        bg({
          type : 'LOG_SESSION',
          data : {
            sessionId,
            studentName : name,
            studentEmail: email,
            durationMs,
            formUrl     : location.href,
            startTime   : new Date().toISOString(),
          },
        }, (resp) => finish(resp));
        /* never make a student wait on the webhook — hard 5s cap */
        setTimeout(() => finish({ ok: true, timeout: true }), 5000);
      });
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
        this.state.pendingSubmit = false;
        this.saveState();
        this.logEvent('exam_submitted', 'info',
          'Student submitted their form.');

        /* The viewform page may have navigated away before it could
           finalize, so send END_SESSION here too — otherwise the
           session is "lost in transit". The backend skips duplicate
           emails for already-finalized sessions. */
        bg({
          type      : 'END_SESSION',
          sessionId : this.state.sessionId,
          student   : this.state.studentName,
          studentEmail: this.state.studentEmail,
          durationMs  : this.getExamDurationMs(),
          reason    : 'submitted',
        }, (resp) => {
          if (!resp || !resp.ok) {
            console.error('[CRC] END_SESSION error (response page):', resp?.error);
          }
        });
      }
      this.stopUnlockPolling();
      // Removed showSubmitted overlay - student can see Google Forms confirmation directly
    }

    async beginExam (name, email, durationMs) {
      this.stopUnlockPolling();

      /* anti-bypass: register with the server FIRST. If an active session
         already exists for this student + form (storage wipe, restart,
         second tab), resume it instead of starting a competing session. */
      const sessionId = genId();
      const serverCheck = await this.sendLogSession(sessionId, name, email, durationMs);
      if (serverCheck && serverCheck.ok && serverCheck.duplicate && serverCheck.session) {
        this.showToast('An active session already exists for you — resuming it.', 'info');
        await this.rebuildFromServer(serverCheck.session);
        return;
      }

      this.state.sessionId      = sessionId;
      this.state.studentName    = name;
      this.state.studentEmail   = email;
      this.state.durationMs     = durationMs;
      this.state.startTime      = Date.now();
      this.state.isStarted      = true;
      this.state.violationCount = 0;
      this.state.isSubmitted    = false;
      this.state.pendingSubmit  = false;
      this.state.isLocked       = false;
      this.state.violations     = [];
      this.state.formId         = this.FORM_ID;

      this.saveState();
      this.clearOverlay();

      /* Log session start */
      const minutes = Math.round(this.getExamDurationMs() / 60000);
      this.logEvent('exam_started', 'info',
        `Exam started by ${name}. Duration: ${minutes} minutes.`);

      this.activateExamMode();
    }

    resumeExam () {
      this.stopUnlockPolling();
      this.clearOverlay();
      this.activateExamMode();

      /* verify timer + violation count + lock state against the server */
      this.reconcileWithServer();
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
      this.startReconcileInterval();

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

      /* positive pause moments: quiet milestones for clean sessions.
         Celebrating focus (never a violation) is what makes staying
         honest feel rewarding instead of just policed. */
      const elapsedPct = this.getExamDurationMs() > 0
        ? 1 - (remaining / this.getExamDurationMs()) : 0;
      const milestones = [
        { pct: 0.25, msg: '🎯 25% done — you\'re on track. Keep it up.' },
        { pct: 0.5,  msg: '🌟 Halfway there, violation-free. Strong finish ahead.' },
      ];
      const fresh = milestones.filter(m =>
        elapsedPct >= m.pct && !this.milestonesShown.has(m.pct));
      fresh.forEach(m => this.milestonesShown.add(m.pct));
      if (fresh.length && this.state.violationCount === 0) {
        /* celebrate only the highest milestone reached (a reload past
           50% shows "Halfway there", not both messages) */
        this.showToast(fresh[fresh.length - 1].msg, 'info');
      }

      /* final-stretch pre-submit checklist: once, when about 3 minutes
         remain, for EVERY session. This is guidance, not a reward — it
         prevents the two classic end-of-exam mistakes: submitting and
         closing the tab before Google records the response, or not
         knowing the exam is over. A reload inside the window still shows
         it (flag is per-page), and it never replays once shown. */
      if (!this.finalStretchShown && remaining > 0 && secs <= 3 * 60) {
        this.finalStretchShown = true;
        this.showToast(
          '⏳ Final stretch — almost there. Before you submit: 1) review your ' +
          'answers 2) press Submit 3) stay on the confirmation page until you ' +
          'see "Your response has been recorded", then close the tab.',
          'info',
          9000
        );
      }
    }

    handleTimeExpired () {
      this.state.isLocked = true;
      this.saveState();
      this.markFinal('locked');
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
        }
        /* R-C fix: no success toast on the locked end (same reasoning as
           the max-violations lockout). */
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

      /* polite live region beside the badge: the count change is announced
         even if the alert toast is missed. Suppressed for the badge's first
         paint (start/resume) so it never announces "0 of 4" unprovoked. */
      const live = document.createElement('div');
      live.className = 'crc-violation-badge-live crc-sr-only';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-atomic', 'true');
      document.body.appendChild(live);
      this.violationBadgeLiveEl = live;
      this._lastBadgeAnnounce = this.state.violationCount;

      this.updateViolationBadge();
    }

    updateViolationBadge () {
      if (!this.violationBadgeEl) return;
      const c = this.state.violationCount;
      this.violationBadgeEl.textContent =
        `⚠️ Violations: ${c} of ${CFG.MAX_VIOLATIONS} — the ${ordinal(CFG.MAX_VIOLATIONS)} locks your exam`;
      this.violationBadgeEl.className = 'crc-violation-badge' +
        (c >= 3 ? ' crc-violation-badge--danger' :
         c >= 2 ? ' crc-violation-badge--warn' : '');
      this.announceBadgeCount(c);
    }

    /* Announce a violation-count change through the polite live region.
       No-op while the count is unchanged, so reloads and badge re-renders
       never repeat stale announcements. */
    announceBadgeCount (c) {
      const el = this.violationBadgeLiveEl;
      if (!el) return;
      const prev = this._lastBadgeAnnounce;
      if (prev === c) return;
      this._lastBadgeAnnounce = c;
      if (c > prev) playViolationCue(c); // subtle audio cue on each increment
      el.textContent = c > prev
        ? `Violation ${c} of ${CFG.MAX_VIOLATIONS} — the ${ordinal(CFG.MAX_VIOLATIONS)} locks your exam.`
        : c === 0
          ? 'Violations cleared. You can continue.'
          : `Violation count: ${c} of ${CFG.MAX_VIOLATIONS}.`;
    }

    /* --------------------------------------------------
       TOAST NOTIFICATIONS
       -------------------------------------------------- */
    showToast (message, level = 'warning', durationMs) {
      const t = document.createElement('div');
      t.className = `crc-toast crc-toast--${level}`;
      /* aria-live: violations interrupt (role=alert); system, milestone and
         celebration notices announce politely (role=status) */
      t.setAttribute('role', (level === 'info' || level === 'success') ? 'status' : 'alert');
      const msgEl = document.createElement('div');
      msgEl.className = 'crc-toast__msg';
      msgEl.textContent = message;
      t.appendChild(msgEl);

      const shouldShowFullscreenBtn =
        !document.fullscreenElement &&
        level !== 'info' && level !== 'success';

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
            relayoutToasts();
          } catch (err) {
            this.showToast('Unable to enter full screen. Click on the page and try again.', 'warning');
          }
        });

        actions.appendChild(btn);
        t.appendChild(actions);
      }
      document.body.appendChild(t);
      relayoutToasts();
      setTimeout(() => {
        t.classList.add('crc-toast--exit');
        setTimeout(() => {
          t.remove();
          relayoutToasts(); // neighbours slide up into the freed slot
        }, 350);
      }, durationMs || CFG.TOAST_DURATION);
    }

    /* --------------------------------------------------
       VIOLATION RECORDING
       -------------------------------------------------- */
    recordViolation (type, severity, details) {
      /* Never penalize a student while the form is being submitted or
         after it has been submitted — a violation must never block
         the final submission. */
      if (this.isSubmitting || this.state.isSubmitted) return;

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

      /* bend-not-break: the first violation gets a calm, concrete message
         so a panicking first-time test taker knows the exam is NOT over
         and exactly what keeps it that way */
      this.showToast(
        this.state.violationCount === 1
          ? '⚠️ Violation 1 of ' + CFG.MAX_VIOLATIONS + ' — ' + details +
            ' This was logged. You can still finish: stay in this tab and fullscreen from here.'
          : '⚠️ Violation ' + this.state.violationCount + ' of ' + CFG.MAX_VIOLATIONS + ': ' + details,
        severity === 'critical' ? 'error' : 'warning'
      );

      /* send to background for Google Sheets */
      this.logEvent(type, severity, details);

      /* check max */
      if (this.state.violationCount >= CFG.MAX_VIOLATIONS) {
        this.state.isLocked = true;
        this.saveState();
        this.markFinal('locked');
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
          }
          /* R-C fix: no success toast on the locked end — the lockout
             overlay already announces the state, and a second
             announcement stacked behind it doubles the message for
             screen readers (and is invisible under the overlay anyway). */
        });
        this.showLockout(
          `You have reached the maximum of ${CFG.MAX_VIOLATIONS} violations. Your exam is now locked.`
        );
        /* R-F fix: poll the server for an admin unlock on this path too, so a
           locked student is released without reloading the tab. */
        this.startUnlockPolling();
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

        /* a held key repeats keydown at the OS repeat rate — one gesture,
           one violation, so a lingering/stuck key can never burn through
           the violation budget on its own */
        if (e.repeat) return;

        /* track user-initiated fullscreen exits (Escape / F11) so that
           system-driven exits (OS dialogs, notifications) are never
           counted as violations */
        if ((e.key === 'Escape' || e.key === 'F11') && document.fullscreenElement) {
          this.fullscreenExitIntent = Date.now();
        }

        /* Ctrl+Alt is the AltGr typing layer on many non-US keyboards —
           it is never a shortcut this extension polices */
        if (e.ctrlKey && e.altKey) return;

        /* Allow normal typing inside form inputs */
        const tag = (e.target.tagName || '').toLowerCase();
        const isInput = ['input', 'textarea', 'select'].includes(tag) ||
                        e.target.isContentEditable;
        const k = (e.key || '').toLowerCase();
        const mod = e.ctrlKey ? 'Ctrl' : (e.metaKey ? 'Cmd' : '');
        const hasMod = e.ctrlKey || e.metaKey;

        const block = (type, severity, what) => {
          e.preventDefault();
          this.recordViolation(type, severity, `Blocked: ${what}.`);
        };

        /* 1) Developer tools / view source (cheating + bypass vectors) */
        if (e.key === 'F12') {
          return block('devtools_shortcut', 'critical', 'Developer tools (F12)');
        }
        if (hasMod && e.shiftKey && ['i', 'j', 'c'].includes(k)) {
          return block('devtools_shortcut', 'critical',
            `Developer tools (${mod}+Shift+${e.key.toUpperCase()})`);
        }
        if (hasMod && !e.shiftKey && k === 'u') {
          return block('devtools_shortcut', 'critical', 'View source (Ctrl/Cmd+U)');
        }

        /* 2) Clipboard: copy / cut / paste — the main cheating channel */
        if (hasMod && ['c', 'v', 'x'].includes(k)) {
          return block('copy_paste', 'high',
            `Copy/paste (${mod}+${e.key.toUpperCase()})`);
        }
        if (e.key === 'Insert' && (hasMod || e.shiftKey)) {
          return block('copy_paste', 'high', 'Clipboard shortcut (Insert)');
        }
        if (e.key === 'PrintScreen' || e.key === 'PrtSc') {
          return block('screenshot_attempt', 'critical', 'Screenshot (PrintScreen)');
        }

        /* 3) Browser features outside the exam (new tabs/windows, history,
           downloads, reload, address bar, print/save, bookmarks) */
        if (hasMod && e.shiftKey) {
          const s = {
            t: ['browser_shortcut', 'medium', 'Reopen closed tab (Ctrl/Cmd+Shift+T)'],
            n: ['browser_shortcut', 'high', 'New incognito window (Ctrl/Cmd+Shift+N)'],
            w: ['browser_shortcut', 'medium', 'Close window (Ctrl/Cmd+Shift+W)'],
            r: ['keyboard_blocked', 'medium', 'Hard reload (Ctrl/Cmd+Shift+R)'],
            s: ['print_save', 'medium', 'Save page as (Ctrl/Cmd+Shift+S)'],
          };
          if (s[k]) {
            e.preventDefault();
            this.recordViolation(s[k][0], s[k][1], `Blocked: ${s[k][2]}.`);
            return;
          }
        }
        if (hasMod && !e.shiftKey) {
          const b = {
            t: ['browser_shortcut', 'medium', 'New tab (Ctrl/Cmd+T)'],
            n: ['browser_shortcut', 'medium', 'New window (Ctrl/Cmd+N)'],
            w: ['browser_shortcut', 'medium', 'Close tab (Ctrl/Cmd+W)'],
            h: ['browser_shortcut', 'high', 'Browser history (Ctrl/Cmd+H)'],
            j: ['browser_shortcut', 'high', 'Downloads (Ctrl/Cmd+J)'],
            o: ['browser_shortcut', 'medium', 'Open file (Ctrl/Cmd+O)'],
            l: ['browser_shortcut', 'medium', 'Focus address bar (Ctrl/Cmd+L)'],
            k: ['browser_shortcut', 'medium', 'Search / address bar (Ctrl/Cmd+K)'],
            e: ['browser_shortcut', 'medium', 'Search / address bar (Ctrl/Cmd+E)'],
            d: ['browser_shortcut', 'low', 'Bookmark page (Ctrl/Cmd+D)'],
            p: ['print_save', 'medium', 'Print (Ctrl/Cmd+P)'],
            s: ['print_save', 'medium', 'Save page (Ctrl/Cmd+S)'],
            r: ['keyboard_blocked', 'medium', 'Reload (Ctrl/Cmd+R)'],
            a: ['keyboard_blocked', 'medium', 'Select all (Ctrl/Cmd+A)'],
          };
          if (b[k]) {
            /* allow Ctrl/Cmd+A inside inputs for normal text selection */
            if (k === 'a' && isInput) return;
            e.preventDefault();
            this.recordViolation(b[k][0], b[k][1], `Blocked: ${b[k][2]}.`);
            return;
          }
        }

        /* 4) Unmodified keys that leave the exam */
        if (!hasMod && e.key === 'F5') {
          return block('keyboard_blocked', 'medium', 'Reload (F5)');
        }
        if (e.key === 'F6') {
          return block('browser_shortcut', 'medium', 'Focus address bar (F6)');
        }
        if (e.altKey && (k === 'arrowleft' || k === 'arrowright')) {
          e.preventDefault();
          this.recordViolation('browser_shortcut', 'medium',
            `Blocked: ${k === 'arrowleft' ? 'Back (Alt+Left arrow)' : 'Forward (Alt+Right arrow)'}.`);
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
          const userInitiated = this.fullscreenExitIntent &&
            (Date.now() - this.fullscreenExitIntent) < 1500;
          this.fullscreenExitIntent = 0;
          this.fullscreenExitCounted = userInitiated;

          if (userInitiated) {
            this.recordViolation('fullscreen_exit', 'high',
              'Exited fullscreen mode.');
          } else {
            /* no Escape/F11 key → the OS or a system notification forced
               the exit — warn and re-enter, but do NOT count it */
            this._logSuppressedEvent('fullscreen_exit', 0,
              'System-driven fullscreen exit (no Escape/F11 key)');
            this.notifySystemInterruption(
              'Fullscreen was interrupted by the system (for example a notification or low-battery alert). This was NOT counted as a violation.');
            this.requestFullscreen();
            return;
          }
          /* try to re-enter; if it fails, show a banner with a button */
          this.requestFullscreen();
        }
        /* hide banner when we're back in fullscreen */
        if (document.fullscreenElement) {
          this.hideFullscreenBanner();
        }
      });

      /* ---- reconcile on attention return ----
         An admin may change the exam duration mid-exam; re-verifying
         when the tab regains focus or becomes visible picks that up the
         moment the student looks at the page, instead of waiting up to
         a full reconcile interval. */
      on(window, 'focus', () => this.reconcileWithServer());
      on(document, 'visibilitychange', () => {
        if (!document.hidden) this.reconcileWithServer();
      });

      /* ---- beforeunload (warn, not violation) ----
         Skip the warning while the form is being submitted, so a
         first-time test taker is not shown a scary "Leave site?"
         dialog right after clicking Submit. */
      on(window, 'beforeunload', e => {
        if (this.state.isStarted && !this.state.isSubmitted && !this.state.isLocked &&
            !this.isSubmitting && !this.state.pendingSubmit) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      /* ---- pagehide failsafe ----
         If the student submitted and the tab/page is closed before
         the confirmation was observed, finalize the session here so
         the exam is never "lost in transit". (The background service
         worker survives this tab and completes the webhook call.) */
      on(window, 'pagehide', () => {
        if (!this.state.isStarted || this.state.isSubmitted || this.state.isLocked) return;
        if (!this.isSubmitting && !this.state.pendingSubmit) return;

        bg({
          type      : 'END_SESSION',
          sessionId : this.state.sessionId,
          student   : this.state.studentName,
          studentEmail: this.state.studentEmail,
          durationMs  : this.getExamDurationMs(),
          reason    : 'submitted',
          endTime   : new Date().toISOString(),
        });
      });
    }

    /* --------------------------------------------------
       ATTENTION-LOSS MONITORS

       Two separate signals feed two timers so that system
       notifications / OS dialogs are never counted:

       • tab hidden (visibilitychange) → the page really went away
         (tab switch / minimise). Counted once it stays hidden past
         HIDDEN_GRACE_MS.
       • window blur while the page stays VISIBLE → typically a
         system notification, meeting alert or dialog. Counted only
         if focus stays away past BLUR_GRACE_MS (2 seconds).
       -------------------------------------------------- */
    _setupGracePeriodMonitors (on) {
      on(document, 'visibilitychange', () => {
        if (!this.state.isStarted || this.state.isLocked || this.isSubmitting) return;
        if (document.hidden) {
          this._armHiddenCheck();
        } else {
          /* tab became visible again — cancel a still-pending check */
          this._cancelPendingAttention('tab_hidden');
        }
      });

      on(window, 'blur', () => {
        if (!this.state.isStarted || this.state.isLocked || this.reenteringFS || this.isSubmitting) return;
        this._armBlurCheck();
      });

      on(window, 'focus', () => {
        this._cancelPendingAttention('window_blur');
      });

      /* a network drop can cancel focus without a real switch — restore */
      on(window, 'online', () => {
        this._cancelPendingAttention('window_blur');
        this._cancelPendingAttention('tab_hidden');
      });
    }

    /** Arm the tab-hidden check (real switch) after a short grace. */
    _armHiddenCheck () {
      this.lastHiddenAt = Date.now();
      if (this.hiddenCheckTimer) clearTimeout(this.hiddenCheckTimer);
      this.hiddenCheckTimer = setTimeout(() => {
        this.hiddenCheckTimer = null;
        if (!this.state.isStarted || this.state.isLocked || this.isSubmitting) return;
        if (document.hidden) {
          this.recordViolation('tab_hidden', 'high',
            'Tab was hidden (switched tabs or minimised the window).');
        }
      }, CFG.HIDDEN_GRACE_MS);
    }

    /** Arm the visible-but-unfocused check (long grace for system popups). */
    _armBlurCheck () {
      this.lastBlurAt = Date.now();
      if (this.blurCheckTimer) clearTimeout(this.blurCheckTimer);
      this.blurCheckTimer = setTimeout(() => {
        this.blurCheckTimer = null;
        if (!this.state.isStarted || this.state.isLocked || this.isSubmitting) return;
        /* count only when the page is STILL VISIBLE but unfocused for a
           sustained period — a hidden page is owned by the hidden check */
        if (!document.hasFocus() && !document.hidden) {
          this.recordViolation('window_blur', 'high',
            'The exam window was left unfocused for several seconds.');
        }
      }, CFG.BLUR_GRACE_MS);
    }

    /**
     * Cancel a pending attention check. A cancel inside the grace window
     * means the interruption was short-lived (system notification, alert,
     * accidental blip) → inform the student it was NOT counted.
     */
    _cancelPendingAttention (kind) {
      const timer = kind === 'window_blur' ? this.blurCheckTimer : this.hiddenCheckTimer;
      if (!timer) return;
      clearTimeout(timer);
      if (kind === 'window_blur') this.blurCheckTimer = null;
      else this.hiddenCheckTimer = null;

      const elapsed = Date.now() - (kind === 'window_blur' ? this.lastBlurAt : this.lastHiddenAt);
      this._logSuppressedEvent(kind, elapsed,
        kind === 'window_blur'
          ? 'Focus returned within the grace window (system notification or brief interruption)'
          : 'Tab became visible again within the grace window');
      this.notifySystemInterruption();
    }

    /** Show a throttled, clearly-labelled "not counted" info toast. */
    notifySystemInterruption (customMessage) {
      const now = Date.now();
      if (this.lastSystemToastAt && now - this.lastSystemToastAt < CFG.SYSTEM_TOAST_THROTTLE_MS) return;
      this.lastSystemToastAt = now;
      this.showToast(
        customMessage ||
        '🔔 A system notification or pop-up briefly interrupted the exam (for example low battery or a meeting alert). This was NOT counted as a violation.',
        'info'
      );
    }

    /* Log suppressed events to the audit log (never the Violations sheet,
       so they can never become a violation). */
    _logSuppressedEvent (type, durationMs, reason) {
      const now = Date.now();
      if (this.lastSuppressLogAt && now - this.lastSuppressLogAt < CFG.SUPPRESS_LOG_THROTTLE_MS) {
        console.log(`[CRC] ${type} suppressed: ${reason} (${durationMs}ms) [log throttled]`);
        return;
      }
      this.lastSuppressLogAt = now;
      bg({
        type : 'LOG_AUDIT',
        data : {
          sessionId    : this.state.sessionId,
          studentName  : this.state.studentName,
          studentEmail : this.state.studentEmail,
          event        : `${type}_suppressed`,
          details      : `${type} suppressed: ${reason} (duration: ${durationMs}ms)`,
          timestamp    : new Date().toISOString(),
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
          ${this.fullscreenExitCounted
            ? '⚠️ You exited fullscreen — this was logged as a violation.'
            : '🔔 Fullscreen was interrupted by the system (notification or alert). Re-enter to continue — this was NOT counted as a violation.'}
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
      /* Method 1: MutationObserver watching for Google's confirmation text.
         NOTE: this observer intentionally survives teardown() so that a
         confirmation arriving after a lockout can still finalize the
         session instead of being "lost in transit". */
      const observer = new MutationObserver(() => {
        if (this.state.isSubmitted) return;

        /* Google Forms shows a "Your response has been recorded" element */
        const body = document.body.innerText || '';
        if (
          body.includes('Your response has been recorded') ||
          body.includes('Your answer has been recorded')   ||
          body.includes('Thanks for your response')
        ) {
          this.handleFormSubmitted();
        }
      });

      observer.observe(document.body, {
        childList: true, subtree: true, characterData: true,
      });
      this.submitObserver = observer;

      /* Method 2: Listen for actual form submit events */
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        const handler = () => {
          /* Mark as submitting to suppress violations during submission */
          this.isSubmitting = true;
          /* Persist the pending submission immediately, so the failsafe
             can finalize the session even if this tab dies right now. */
          this.state.pendingSubmit = true;
          this.saveState();
          /* Google Forms may replace content after submit;
             give it a moment then check. */
          setTimeout(() => {
            if (location.pathname.includes('/formResponse') ||
                location.search.includes('formResponse')) {
              this.handleFormSubmitted();
            } else if (!this.state.isSubmitted) {
              /* The page is still here and no confirmation was observed —
                 the submit did not complete (e.g. Google Forms validation
                 or a network error). Release the pending flag so a later
                 tab close cannot falsely finalize this session as
                 "submitted", and tracking can resume normally. */
              this.state.pendingSubmit = false;
              this.saveState();
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
      this.state.pendingSubmit = false;
      this.saveState();

      /* stop the submission watcher — the session is now finalized */
      if (this.submitObserver) {
        this.submitObserver.disconnect();
        this.submitObserver = null;
      }

      this.markFinal('submitted');
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
        } else if (this.state.violationCount === 0) {
          /* finish-line reward moment: a calm, celebratory success toast
             that stays a beat longer than routine notices */
          this.showToast(
            '🎉 Exam submitted — no violations on record. You\'re all set!',
            'success',
            9000
          );
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
      this.stopReconcileInterval();
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
