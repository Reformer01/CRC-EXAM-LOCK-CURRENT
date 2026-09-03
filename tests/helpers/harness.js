'use strict';
/* Shared harness for the CRC Exam Lockdown regression suite.
   Dependency-free: Node >= 14 + the repo files only.
   The client harness drives the REAL content.js/popup.js inside a stubbed
   DOM/chrome environment; the backend sandbox runs GoogleSheetsScript.gs in
   a vm with stubbed SpreadsheetApp. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const EXT = path.join(__dirname, '..', '..', 'CRC-EXAM-LOCK');
const contentSrc = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
const popupSrc = fs.readFileSync(path.join(EXT, 'popup.js'), 'utf8');
const gsSrc = () => fs.readFileSync(path.join(EXT, 'GoogleSheetsScript.gs'), 'utf8');
const overlayCssSrc = () => fs.readFileSync(path.join(EXT, 'overlay.css'), 'utf8');
const popupCssSrc = () => fs.readFileSync(path.join(EXT, 'popup.css'), 'utf8');

const tick = (ms) => new Promise(r => setTimeout(r, ms));
const FORM_ID = 'FAKEID';

/* ------------------------------------------------------------------ */
/* Collector used by the runner (pass/xfail/fail + per-check reporting) */
/* ------------------------------------------------------------------ */
function createCollector() {
  const results = [];
  return {
    results,
    async check(name, fn) {
      try { await fn(); results.push({ name, pass: true, xfail: false }); }
      catch (e) { results.push({ name, pass: false, xfail: false, detail: e.message }); }
    },
    /* expected-fail: documents a known defect; flipping to pass is a signal */
    async xcheck(name, fn, reason) {
      try { await fn(); results.push({ name, pass: true, xfail: true, detail: 'NOW PASSES — remove xfail: ' + reason }); }
      catch (e) { results.push({ name, pass: false, xfail: true, reason }); }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Minimal DOM element stub                                            */
/* ------------------------------------------------------------------ */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), className: '', innerHTML: '', textContent: '',
    value: '', style: {}, children: [], listeners: {}, disabled: false, _focused: false,
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); },
    setAttribute(k, v) { this['_a_' + k] = v; },
    getAttribute(k) { return this['_a_' + k]; },
    appendChild(c) { c._parent = this; this.children.push(c); return c; },
    remove() { if (this._parent) { const i = this._parent.children.indexOf(this); if (i >= 0) this._parent.children.splice(i, 1); this._parent = null; } },
    querySelector(sel) { if (!this._qs) this._qs = {}; if (!this._qs[sel]) this._qs[sel] = makeEl('div'); return this._qs[sel]; },
    querySelectorAll() { return []; },
    focus() { this._focused = true; },
    click() {},
    requestFullscreen() { return Promise.resolve(); },
    classList: {
      add(...cs) { const cur = el.className ? el.className.split(' ') : []; cs.forEach(c => { if (!cur.includes(c)) cur.push(c); }); el.className = cur.join(' '); },
      remove(...cs) { el.className = el.className.split(' ').filter(c => !cs.includes(c)).join(' '); },
    },
  };
  return el;
}

/* ------------------------------------------------------------------ */
/* Client world: real content.js running in a stubbed environment      */
/* ------------------------------------------------------------------ */
/* serverCfg: {
     session:    { sessionId, unlocked, clearedAt, startTime, violationCount, status, reason, durationMs } | null,
     examDefault:{ ok, found, durationMs },
     duplicate:  { session: <session> } | null,   // LOG_SESSION answers "already active"
   }
*/
function createWorld(serverCfg, seedStorage) {
  const cfg = {
    session: (serverCfg && serverCfg.session) || null,
    examDefault: (serverCfg && serverCfg.examDefault) || { ok: true, found: false, durationMs: 0 },
    duplicate: (serverCfg && serverCfg.duplicate) || null,
  };
  const fetchCounts = { exam_default: 0, session_status: 0, find_session: 0 };
  const storageData = seedStorage ? JSON.parse(JSON.stringify(seedStorage)) : {};
  const observers = [];
  const docListeners = {};
  const winListeners = {};
  const bodyEl = makeEl('body');
  const formStub = makeEl('form');
  const runtimeListeners = [];
  const sentMsgs = [];
  let bgSession = null; // emulates background.js activeSession lifecycle
  let bgFinal = null;   // emulates background.js lastFinal (locked/submitted)

  global.__crcExamLockLoaded = false;
  global.MutationObserver = class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() {} disconnect() { this._disconnected = true; }
  };

  global.chrome = {
    runtime: {
      sendMessage(msg, cb) {
        sentMsgs.push(msg);
        switch (msg.type) {
          case 'EXAM_ACTIVE':
            bgSession = { sessionId: msg.sessionId, student: msg.student, studentEmail: msg.studentEmail, tabId: 1 };
            bgFinal = null;
            if (cb) cb({ ok: true });
            break;
          case 'SESSION_FINAL':
            bgFinal = {
              sessionId: msg.sessionId, student: msg.student,
              studentEmail: msg.studentEmail,
              status: msg.status === 'submitted' ? 'submitted' : 'locked',
            };
            if (cb) cb({ ok: true });
            break;
          case 'EXAM_INACTIVE':
            /* background.js clears the tracked session but keeps lastFinal */
            bgSession = null;
            if (cb) cb({ ok: true });
            break;
          case 'END_SESSION':
            /* clears the tracked session; records the final state by reason */
            bgSession = null;
            if (msg.reason === 'submitted') {
              bgFinal = { sessionId: msg.sessionId, student: msg.student, studentEmail: msg.studentEmail, status: 'submitted' };
            } else if (msg.reason === 'max_violations' || msg.reason === 'time_expired') {
              bgFinal = { sessionId: msg.sessionId, student: msg.student, studentEmail: msg.studentEmail, status: 'locked' };
            }
            if (cb) cb({ ok: true });
            break;
          case 'LOG_SESSION':
            if (cfg.duplicate && cfg.duplicate.session) {
              if (cb) cb({ ok: true, duplicate: true, session: cfg.duplicate.session });
            } else if (msg.data && msg.data.sessionId) {
              cfg.session = {
                sessionId: msg.data.sessionId,
                durationMs: Number(msg.data.durationMs) || 0,
                status: 'Active',
                startTime: new Date().toISOString(),
              };
              if (cb) cb({ ok: true });
            } else if (cb) cb({ ok: true });
            break;
          default:
            if (cb) cb({ ok: true });
        }
      },
      onMessage: { addListener(fn) { runtimeListeners.push(fn); } },
      lastError: null,
    },
    storage: {
      local: {
        get(keys, cb) { const r = {}; keys.forEach(k => { r[k] = storageData[k]; }); cb(r); },
        set(obj, cb) { Object.assign(storageData, obj); if (cb) cb(); },
      },
    },
  };

  global.document = {
    readyState: 'complete', hidden: false, fullscreenElement: null, activeElement: null,
    documentElement: makeEl('html'), body: bodyEl,
    addEventListener(t, fn, o) { (docListeners[t] = docListeners[t] || []).push({ fn, opts: o }); },
    removeEventListener(t, fn) { docListeners[t] = (docListeners[t] || []).filter(h => h.fn !== fn); },
    createElement(tag) { return makeEl(tag); },
    querySelectorAll(sel) { return sel === 'form' ? [formStub] : []; },
    hasFocus() { return true; },
  };
  global.location = {
    pathname: '/forms/d/e/' + FORM_ID + '/viewform', search: '',
    href: 'https://docs.google.com/forms/d/e/' + FORM_ID + '/viewform',
  };
  global.window = global;
  global.addEventListener = (t, fn, o) => { (winListeners[t] = winListeners[t] || []).push({ fn, opts: o }); };
  global.removeEventListener = (t, fn) => { winListeners[t] = (winListeners[t] || []).filter(h => h.fn !== fn); };
  global.fetch = (url) => {
    const action = new URL(url).searchParams.get('action');
    if (action === 'exam_default') {
      fetchCounts.exam_default++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(cfg.examDefault) });
    }
    if (action === 'session_status') {
      fetchCounts.session_status++;
      const s = cfg.session;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        ok: true, sessionId: s ? s.sessionId : 'x', found: !!s,
        unlocked: s ? !!s.unlocked : false, clearedAt: s ? (s.clearedAt || '') : '',
        startTime: s ? s.startTime : '', violationCount: s ? (s.violationCount || 0) : 0,
        status: s ? s.status : '', reason: s ? (s.reason || '') : '', durationMs: s ? (s.durationMs || 0) : 0,
      }) });
    }
    if (action === 'find_session') {
      fetchCounts.find_session++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, found: false }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, found: false }) });
  };

  vm.runInThisContext(contentSrc, { filename: 'content.js' });

  const fireDoc = (t, e) => (docListeners[t] || []).forEach(h => h.fn(e));
  const fireWin = (t, e) => (winListeners[t] || []).forEach(h => h.fn(e));
  const fireObserver = () => observers.forEach(o => { if (!o._disconnected) o.cb(); });

  const overlays = () => bodyEl.children.filter(c => String(c.className || '').indexOf('crc-overlay') === 0);
  const toasts = () => bodyEl.children.filter(c => String(c.className || '').indexOf('crc-toast') === 0);
  const timer = () => bodyEl.children.find(c => String(c.className || '').indexOf('crc-timer') === 0);
  const badge = () => bodyEl.children.find(c => String(c.className || '').indexOf('crc-violation-badge') === 0);

  function snapshot() {
    return {
      toastCount: toasts().length,
      toasts: toasts().map(t => ({
        cls: t.className, role: t.getAttribute('role'),
        text: (t.children[0] || {}).textContent || '',
      })),
      overlay: overlays().length
        ? { html: (overlays()[overlays().length - 1].innerHTML || '').slice(0, 400), role: overlays()[overlays().length - 1].getAttribute('role') }
        : null,
      timerPresent: !!timer(),
      badgeText: badge() ? badge().textContent : null,
    };
  }

  async function liveStatus() {
    const fn = runtimeListeners[runtimeListeners.length - 1];
    if (!fn) return null;
    return new Promise(resolve => fn({ type: 'GET_LIVE_STATUS' }, {}, resolve));
  }

  async function getStatus() {
    /* emulate background.js GET_STATUS → content GET_LIVE_STATUS */
    if (!bgSession || !bgSession.tabId) {
      if (bgFinal) {
        return { active: false, sessionId: bgFinal.sessionId, student: bgFinal.student, live: null, final: bgFinal };
      }
      return { active: false, sessionId: null, student: null, live: null, final: null };
    }
    const live = await liveStatus();
    return { active: true, sessionId: bgSession.sessionId, student: bgSession.student, live: live || null, final: null };
  }

  async function startExam(name, email, durationMs) {
    await tick(20);
    const overlay = bodyEl.children.find(c => String(c.className || '').indexOf('crc-overlay') === 0);
    if (!overlay) throw new Error('no setup overlay to start from');
    const btn = overlay.querySelector('#crc-start-btn');
    overlay.querySelector('#crc-name-input').value = name || 'Test Student';
    overlay.querySelector('#crc-email-input').value = email || 'test@crc-test.local';
    overlay.querySelector('#crc-duration-input').value = String(durationMs || 3600000);
    for (const fn of (btn.listeners.click || [])) { await fn({}); }
    await tick(700); // let the delayed fullscreen request settle
  }

  return {
    bodyEl, formStub, fireDoc, fireWin, fireObserver, snapshot, startExam,
    liveStatus, getStatus, sentMsgs, fetchCounts,
    storageData, overlays, toasts, timer, badge, FORM_ID,
    cfg,
  };
}

/* Synthetic keydown event that satisfies the extension's guard */
function keyEvt(key, extra) {
  return Object.assign({
    key, repeat: false, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault() {}, target: { tagName: 'DIV' },
  }, extra || {});
}

/* Runs the REAL popup.js against stub DOM; returns the element map */
function runPopup(world) {
  const ids = ['popup-status-dot', 'popup-status-text', 'popup-details', 'popup-student', 'popup-session',
    'popup-time', 'popup-violations', 'popup-note', 'popup-test-webhook', 'popup-test-webhook-status'];
  const els = {};
  ids.forEach(id => { els[id] = makeEl('div'); els[id].id = id; });
  const ctx = {
    console,
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(msg, cb) {
          if (msg.type === 'GET_STATUS') {
            world.getStatus().then(res => { try { cb(res); } catch (e) { /* render error */ } });
          } else if (cb) cb({ ok: true });
        },
      },
    },
    document: { getElementById(id) { return els[id] || null; } },
  };
  vm.createContext(ctx);
  vm.runInContext(popupSrc, ctx, { filename: 'popup.js' });
  return els;
}

/* ------------------------------------------------------------------ */
/* Backend sandbox: real GoogleSheetsScript.gs in a vm                  */
/* ------------------------------------------------------------------ */
function rangeObj() {
  return {
    setValue() { return this; }, setValues() { return this; }, getValues() { return []; },
    setFontWeight() { return this; }, setFrozenRows() { return this; }, setBackground() { return this; },
  };
}

/* Sheet stub with Apps-Script-like row capacity so the Review Queue's
   clear / append / trim cycle behaves realistically. */
function makeSheet(header, name) {
  const data = header ? [header.slice()] : [];
  const sheet = {
    _name: name || null,
    _data: data,
    _maxRows: header ? 1 : 0,
    _fills: {},
    getName() { return this._name; },
    appendRow(v) { data.push(v.slice()); if (data.length > this._maxRows) this._maxRows = data.length; return this; },
    clear() { data.length = 0; this._fills = {}; return this; },
    getMaxRows() { return this._maxRows; },
    insertRows(afterPos, count) { this._maxRows += count; return this; },
    deleteRow(r) {
      data.splice(r - 1, 1);
      this._maxRows = Math.max(this._maxRows - 1, data.length);
      return this;
    },
    deleteRows(start, count) {
      data.splice(start - 1, count);
      this._maxRows = Math.max(this._maxRows - count, data.length);
      return this;
    },
    getDataRange() { return { getValues() { return data.map(r => r.slice()); } }; },
    getRange(r, c, nr, nc) {
      const rr = r, cc = c, nn = nr, mm = nc;
      const fill = (fillColor, rows) => {
        for (let i = 0; i < rows && rr - 1 + i < data.length; i++) sheet._fills[rr + i] = fillColor;
      };
      if (nn !== undefined && mm !== undefined) {
        return Object.assign(rangeObj(), {
          getValues() { return data.slice(rr - 1, rr - 1 + nn).map(row => row.slice(cc - 1, cc - 1 + mm)); },
          setValues(vals) {
            for (let i = 0; i < nn && rr - 1 + i < data.length; i++) {
              const row = data[rr - 1 + i];
              for (let j = 0; j < mm && j < vals[i].length; j++) row[cc - 1 + j] = vals[i][j];
            }
          },
          setBackground(f) { fill(f, nn); return this; },
        });
      }
      if (nn !== undefined) {
        return Object.assign(rangeObj(), {
          setValues(vals) {
            for (let i = 0; i < nn && rr - 1 + i < data.length; i++) {
              const row = data[rr - 1 + i];
              for (let j = 0; j < vals[i].length; j++) row[cc - 1 + j] = vals[i][j];
            }
          },
          setBackground(f) { fill(f, nn); return this; },
        });
      }
      return Object.assign(rangeObj(), {
        setValue(v) { data[r - 1][c - 1] = v; return this; },
        getValues() { return [data[r - 1].slice()]; },
        getValue() { const row = data[r - 1]; return row ? row[c - 1] : undefined; },
      });
    },
    getLastColumn() { return (header || []).length; },
    getLastRow() { return data.length; },
    setFontWeight() { return this; },
    setFrozenRows() { return this; },
    insertColumnAfter() { return this; },
  };
  return sheet;
}

/* opts: { ui: stubUi } — see backend-admin suite for a UI stub */
function createBackendSandbox(opts) {
  opts = opts || {};
  const ctx = {
    console,
    LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
    MailApp: {},
  };
  const sheets = {};
  const sheetOrder = [];
  let activeName = null;
  let activeRow = 1;
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet() {
      return {
        getSheetByName(n) { return sheets[n] || null; },
        insertSheet(n) {
          const s = makeSheet(null, n);
          s.getActiveRange = () => ({ getRowIndex: () => activeRow || 1 });
          sheets[n] = s;
          if (!sheetOrder.includes(n)) sheetOrder.push(n);
          if (activeName === null) activeName = n;
          return s;
        },
        getActiveSheet() { return activeName ? (sheets[activeName] || null) : null; },
        setActiveSheet(sh) { if (sh && sh.getName) activeName = sh.getName(); return sh; },
        getUi() { return opts.ui; },
      };
    },
    getUi() { return opts.ui; },
  };
  /* selection helpers for queue-row actions */
  opts.select = (sheetName, row) => { activeName = sheetName; activeRow = row || 1; };
  opts.activeRow = () => activeRow;
  ctx.getActiveRowForTest = () => activeRow;
  ctx.Session = { getActiveUser() { return { getEmail() { return 'admin@crc.edu'; } }; } };
  ctx.ContentService = {
    createTextOutput(s) { return { getContent() { return s; }, setMimeType() { return this; } }; },
    MimeType: { JSON: 'application/json' },
  };
  const debug = [];
  vm.createContext(ctx);
  vm.runInContext(gsSrc(), ctx, { filename: 'GoogleSheetsScript.gs' });
  ctx.logDebug_ = function () { debug.push([].slice.call(arguments)); };
  ctx.logCellCount_ = function () {};

  /* create all sheets with the production headers */
  vm.runInContext('ensureSheets()', ctx);

  const run = (fn, args) => vm.runInContext(fn + '(' + (args || []).map(a => JSON.stringify(a)).join(',') + ')', ctx);
  const data = (name) => sheets[name]._data;
  const headerCol = (name, title) => data(name)[0].indexOf(title) + 1;
  const rowFor = (name, sidColTitle, sid) => {
    const rows = data(name);
    const c = headerCol(name, sidColTitle);
    for (let i = 1; i < rows.length; i++) if (String(rows[i][c - 1]) === String(sid)) return rows[i];
    return null;
  };
  return { ctx, sheets, sheetOrder, debug, run, data, headerCol, rowFor, select: opts.select };
}

module.exports = {
  EXT, contentSrc, popupSrc, gsSrc, overlayCssSrc, popupCssSrc,
  tick, FORM_ID, createCollector, makeEl, createWorld, keyEvt, runPopup,
  makeSheet, createBackendSandbox,
};
