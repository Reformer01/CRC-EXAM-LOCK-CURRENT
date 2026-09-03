
/* ---- Sheet names ---- */
var SESSIONS_SHEET   = 'Sessions';
var VIOLATIONS_SHEET = 'Violations';
var UNLOCKS_SHEET    = 'Unlocks';
var EXAMS_SHEET      = 'Exams';
var RESETS_SHEET     = 'Resets';
var DEBUGLOG_SHEET   = 'DebugLog';
var REVIEW_SHEET     = 'Review Queue';

var REVIEW_HEADERS = [
  'Session ID', 'Student Name', 'Student Email', 'Status', 'Violation Count',
  'Time Left', 'Granted', 'Locked / Flagged Since', 'Waiting', 'Latest Flag', 'Next Step'
];
/* Review Queue row fills: darker red = locked 10+ min (stale), red = locked,
   yellow = flagged while still taking the exam, green = all clear. */
var LOCKED_STALE_FILL = '#ea9999';
var LOCKED_FILL       = '#f4c7c3';
var WATCH_FILL        = '#fff2cc';
var CLEAR_FILL        = '#d9ead3';
var LOCKED_STALE_MS   = 10 * 60 * 1000;

/* ---- Diagnostic: Log cell usage ---- */
function logCellCount_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log('ERROR: Cannot get active spreadsheet');
      return 0;
    }
    
    var sheets = ss.getSheets();
    if (!sheets || !sheets.length) {
      Logger.log('ERROR: Cannot get sheets array');
      return 0;
    }
    
    var totalCells = 0;
    var msg = [];
    for (var i = 0; i < sheets.length; i++) {
      var s = sheets[i];
      if (!s) {
        Logger.log('WARNING: Sheet at index ' + i + ' is null');
        continue;
      }
      var maxRows = s.getMaxRows();
      var maxCols = s.getMaxColumns();
      var cells = maxRows * maxCols;
      totalCells += cells;
      msg.push(s.getName() + ': ' + maxRows + 'x' + maxCols + '=' + cells);
    }
    msg.push('TOTAL: ' + totalCells + '/10000000');
    Logger.log(msg.join(' | '));
    return totalCells;
  } catch (e) {
    Logger.log('ERROR in logCellCount_: ' + String(e && e.message ? e.message : e));
    return 0;
  }
}

/* ---- Emergency: Trim sheet dimensions ---- */
function trimSheetDimensions_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var maxRows = sheet.getMaxRows();
    var maxCols = sheet.getMaxColumns();
    
    // Keep buffer but remove excessive allocation
    if (maxRows > Math.max(lastRow + 10, 100)) {
      sheet.deleteRows(lastRow + 1, maxRows - lastRow - 10);
    }
    if (maxCols > Math.max(lastCol + 2, 10)) {
      sheet.deleteColumns(lastCol + 1, maxCols - lastCol - 2);
    }
  }
}

/* ---- Ensure sheets exist with headers ---- */
function ensureSheets () {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  /* The Review Queue is the first tab: invigilators land on it when the
     file opens and it is the default sheet for review actions. */
  if (!ss.getSheetByName(REVIEW_SHEET)) {
    var rq = ss.insertSheet(REVIEW_SHEET, 0);
    rq.appendRow(REVIEW_HEADERS);
    rq.getRange(1, 1, 1, REVIEW_HEADERS.length).setFontWeight('bold');
    rq.setFrozenRows(1);
    try { rq.setTabColor('#c0392b'); } catch (e) { /* cosmetic only */ }
  }

  if (!ss.getSheetByName(SESSIONS_SHEET)) {
    var s = ss.insertSheet(SESSIONS_SHEET);
    s.appendRow([
      'Session ID', 'Student Name', 'Student Email', 'Form URL',
      'Start Time', 'End Time', 'Status', 'Violation Count', 'End Reason',
      'Duration (ms)', 'Extension (ms)'
    ]);
    s.getRange(1, 1, 1, 11).setFontWeight('bold');
    s.setFrozenRows(1);
  } else {
    var sessions = ss.getSheetByName(SESSIONS_SHEET);
    var header = sessions.getRange(1, 1, 1, sessions.getLastColumn()).getValues()[0];
    var desired = [
      'Session ID', 'Student Name', 'Student Email', 'Form URL',
      'Start Time', 'End Time', 'Status', 'Violation Count', 'End Reason',
      'Duration (ms)', 'Extension (ms)'
    ];

    for (var hi = 0; hi < desired.length; hi++) {
      if (header.indexOf(desired[hi]) === -1) {
        sessions.insertColumnAfter(sessions.getLastColumn());
        sessions.getRange(1, sessions.getLastColumn()).setValue(desired[hi]).setFontWeight('bold');
        header.push(desired[hi]);
      }
    }
  }

  if (!ss.getSheetByName(VIOLATIONS_SHEET)) {
    var v = ss.insertSheet(VIOLATIONS_SHEET);
    v.appendRow([
      'Timestamp', 'Session ID', 'Student Name',
      'Type', 'Severity', 'Details'
    ]);
    v.getRange(1, 1, 1, 6).setFontWeight('bold');
    v.setFrozenRows(1);
  }

  if (!ss.getSheetByName(UNLOCKS_SHEET)) {
    var u = ss.insertSheet(UNLOCKS_SHEET);
    u.appendRow([
      'Session ID', 'Unlocked', 'Unlocked At', 'Unlocked By', 'Reason'
    ]);
    u.getRange(1, 1, 1, 5).setFontWeight('bold');
    u.setFrozenRows(1);
  }

  if (!ss.getSheetByName(EXAMS_SHEET)) {
    var ex = ss.insertSheet(EXAMS_SHEET);
    ex.appendRow([
      'Form ID', 'Form URL', 'Default Duration (ms)', 'Updated At', 'Updated By'
    ]);
    ex.getRange(1, 1, 1, 5).setFontWeight('bold');
    ex.setFrozenRows(1);
  }

  if (!ss.getSheetByName(RESETS_SHEET)) {
    var r = ss.insertSheet(RESETS_SHEET);
    r.appendRow([
      'Session ID', 'Cleared At', 'Cleared By', 'Reason'
    ]);
    r.getRange(1, 1, 1, 4).setFontWeight('bold');
    r.setFrozenRows(1);
  }

  if (!ss.getSheetByName(DEBUGLOG_SHEET)) {
    var d = ss.insertSheet(DEBUGLOG_SHEET);
    d.appendRow([
      'Timestamp', 'Level', 'Event', 'Details', 'Session ID', 'Student Email'
    ]);
    d.getRange(1, 1, 1, 6).setFontWeight('bold');
    d.setFrozenRows(1);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getLastClearedAt_(sessionId) {
  if (!sessionId) return '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RESETS_SHEET);
  if (!sheet) return '';

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      return rows[i][1] || '';
    }
  }
  return '';
}

function setClearMarker_(sessionId, reason) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  if (!sessionId) return { ok: false, error: 'missing sessionId' };

  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RESETS_SHEET);
    var rows = sheet.getDataRange().getValues();
    var now = new Date().toISOString();
    var by = 'admin';

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === sessionId) {
        sheet.getRange(i + 1, 2).setValue(now);
        sheet.getRange(i + 1, 3).setValue(by);
        sheet.getRange(i + 1, 4).setValue(reason || '');
        return { ok: true, sessionId: sessionId, clearedAt: now };
      }
    }

    sheet.appendRow([sessionId, now, by, reason || '']);
    return { ok: true, sessionId: sessionId, clearedAt: now };
  });
}

function purgeViolationsForSession_(sessionId) {
  if (!sessionId) return { ok: false, error: 'missing sessionId' };

  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return { ok: false, error: 'Violations sheet missing' };

  var data = sheet.getDataRange().getValues();
  var toDelete = [];

  for (var i = 1; i < data.length; i++) {
    /* Purge real violation rows only. Session markers (exam_started,
       state_*) are audit history and stay, so the confirm dialog's record
       count always matches the number actually deleted. */
    if (data[i][1] === sessionId && isActualViolationRow_(String(data[i][3] || ''))) {
      toDelete.push(i + 1); // +1 for 1-based row numbers
    }
  }

  // Delete rows in reverse order to maintain indices
  for (var i = toDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(toDelete[i]);
  }
  
  return { ok: true, deleted: toDelete.length };
}

function purgeAllViolations_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return { ok: false, error: 'Violations sheet missing' };

  var data = sheet.getDataRange().getValues();
  var toDelete = [];
  for (var i = 1; i < data.length; i++) {
    if (isActualViolationRow_(String(data[i][3] || ''))) toDelete.push(i + 1);
  }

  // Delete rows in reverse order to maintain indices
  for (var i = toDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(toDelete[i]);
  }
  return { ok: true, deleted: toDelete.length };
}

function recomputeViolationCount_(sessionId) {
  if (!sessionId) return 0;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return 0;

  var rows = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === sessionId && isActualViolationRow_(rows[i][3])) count++;
  }

  var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
  var sessionRows = sessionsSheet.getDataRange().getValues();
  var sHeader = sessionRows[0] || [];
  var countCol = sHeader.indexOf('Violation Count');
  for (var j = 1; j < sessionRows.length; j++) {
    if (sessionRows[j][0] === sessionId) {
      /* column resolved by header so the Status column is never clobbered */
      sessionsSheet.getRange(j + 1, countCol !== -1 ? countCol + 1 : 8).setValue(count);
      break;
    }
  }

  return count;
}

/* ==========================================================
   ANTI-BYPASS HELPERS (server-authoritative session state)
   ========================================================== */

/** Extract a stable form ID from a form URL (mirrors content.js). */
function extractFormId_ (url) {
  var m = String(url || '').match(/\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([A-Za-z0-9_-]+)/);
  return m ? m[1] : String(url || '');
}

/** Read the authoritative Sessions row for a session ID. */
function getSessionInfo_ (sessionId) {
  if (!sessionId) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return null;

  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var idx = function (name) { return header.indexOf(name); };
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      return {
        sessionId      : sessionId,
        studentName    : String(rows[i][idx('Student Name')] || ''),
        studentEmail   : String(rows[i][idx('Student Email')] || ''),
        formUrl        : String(rows[i][idx('Form URL')] || ''),
        startTime      : String(rows[i][idx('Start Time')] || ''),
        status         : String(rows[i][idx('Status')] || ''),
        violationCount : Number(rows[i][idx('Violation Count')] || 0),
        durationMs     : Number(rows[i][idx('Duration (ms)')] || 0),
        extensionMs    : Number(rows[i][idx('Extension (ms)')] || 0),
        reason         : String(rows[i][idx('End Reason')] || ''),
      };
    }
  }
  return null;
}

/** Find an ACTIVE session for a student + form (anti-restart). */
function findActiveSession_ (email, formId) {
  if (!email || !formId) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return null;

  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var idx = function (name) { return header.indexOf(name); };
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idx('Student Email')] || '').toLowerCase() !== email) continue;
    if (String(rows[i][idx('Status')] || '') !== 'Active') continue;
    if (extractFormId_(String(rows[i][idx('Form URL')] || '')) !== formId) continue;
    return {
      sessionId      : rows[i][0],
      studentName    : String(rows[i][idx('Student Name')] || ''),
      studentEmail   : String(rows[i][idx('Student Email')] || ''),
      formUrl        : String(rows[i][idx('Form URL')] || ''),
      startTime      : String(rows[i][idx('Start Time')] || ''),
      status         : 'Active',
      violationCount : Number(rows[i][idx('Violation Count')] || 0),
      durationMs     : Number(rows[i][idx('Duration (ms)')] || 0),
      reason         : '',
    };
  }
  return null;
}

/** True only for rows that represent a real student violation.
    Markers (exam_started/submitted, state_*, webhook_test) and
    suppressed events must never count toward a violation tally. */
function isActualViolationRow_ (type) {
  var t = String(type || '').trim();
  if (!t) return false;
  if (t.indexOf('_suppressed') !== -1) return false;
  var markers = [
    'exam_started', 'exam_submitted', 'exam_locked', 'time_expired',
    'webhook_test', 'state_recovered', 'state_tampered', 'state_migrated'
  ];
  return markers.indexOf(t) === -1;
}

/** Map an end reason to its display status. */
function statusForReason_ (reason) {
  return reason === 'submitted' ? 'Submitted' :
         reason === 'time_expired' ? 'Time Expired' :
         reason === 'max_violations' ? 'Locked (Violations)' :
         'Ended';
}

/** Update a Sessions row status/end fields (used by admin unlock). */
function setSessionStatus_ (sessionId, status, endReason, endTime) {
  if (!sessionId) return false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return false;

  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var col = function (name, fallback) {
    var x = header.indexOf(name);
    return (x !== -1) ? (x + 1) : fallback;
  };
  var COL_STATUS     = col('Status', 6);
  var COL_END_REASON = col('End Reason', 9);
  var COL_END_TIME   = col('End Time', 5);
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      sheet.getRange(i + 1, COL_STATUS).setValue(status || '');
      sheet.getRange(i + 1, COL_END_REASON).setValue(endReason || '');
      sheet.getRange(i + 1, COL_END_TIME).setValue(endTime || '');
      return true;
    }
  }
  return false;
}

/* ---- EXAM DEFAULTS (bulk duration change) ---- */

/** Read the configured default duration for a form, if one exists. */
function getExamDefault_ (formId) {
  if (!formId) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EXAMS_SHEET);
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === String(formId).trim()) {
      var d = Number(rows[i][2]);
      return (Number.isFinite(d) && d > 0) ? d : null;
    }
  }
  return null;
}

/**
 * Set the duration for an entire exam: write the Exams default for
 * future starts and update every Active session of that form so
 * running exams adopt it within the client's reconcile interval.
 * Locked, submitted, and expired sessions are never touched.
 */
function setExamDurationForForm (formId, formUrl, durationMs) {
  durationMs = Number(durationMs);
  if (!formId) return { ok: false, error: 'missing_formId' };
  if (!(durationMs >= 10 * 60 * 1000 && durationMs <= 8 * 60 * 60 * 1000)) {
    return { ok: false, error: 'invalid_duration' };
  }

  return withLock_(function () {
    ensureSheets();
    var now = new Date().toISOString();
    var by = getActorEmail_();

    /* upsert the Exams default */
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var exams = ss.getSheetByName(EXAMS_SHEET);
    var erows = exams.getDataRange().getValues();
    var foundRow = -1;
    for (var i = 1; i < erows.length; i++) {
      if (String(erows[i][0] || '').trim() === String(formId).trim()) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow > 0) {
      exams.getRange(foundRow, 3, 1, 3).setValues([[durationMs, now, by]]);
    } else {
      exams.appendRow([formId, formUrl || '', durationMs, now, by]);
    }

    /* update every Active session of this form */
    var sessions = ss.getSheetByName(SESSIONS_SHEET);
    var srows = sessions.getDataRange().getValues();
    var header = srows[0] || [];
    var col = function (name, fallback) {
      var x = header.indexOf(name);
      return (x !== -1) ? (x + 1) : fallback;
    };
    var COL_FORM_URL = col('Form URL', 4);
    var COL_STATUS   = col('Status', 7);
    var COL_DURATION = col('Duration (ms)', 10);

    var updated = 0;
    for (var j = 1; j < srows.length; j++) {
      if (!String(srows[j][0] || '')) continue;
      if (String(srows[j][COL_STATUS - 1] || '').trim() !== 'Active') continue;
      if (extractFormId_(String(srows[j][COL_FORM_URL - 1] || '')) !== String(formId).trim()) continue;
      sessions.getRange(j + 1, COL_DURATION).setValue(durationMs);
      updated++;
    }

    logDebug_('INFO', 'admin_action', JSON.stringify({
      action: 'set_exam_duration',
      formId: formId,
      durationMs: durationMs,
      activeSessionsUpdated: updated,
      actor: by,
    }), '', '');

    return { ok: true, updated: updated, durationMs: durationMs };
  });
}

/** Count Active sessions for a form (used to make the confirmation concrete). */
function countActiveSessionsForForm_ (formId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return 0;
  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var col = function (name, fallback) {
    var x = header.indexOf(name);
    return (x !== -1) ? (x + 1) : fallback;
  };
  var COL_FORM_URL = col('Form URL', 4);
  var COL_STATUS   = col('Status', 7);
  var count = 0;
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][0] || '')) continue;
    if (String(rows[i][COL_STATUS - 1] || '').trim() !== 'Active') continue;
    if (extractFormId_(String(rows[i][COL_FORM_URL - 1] || '')) !== String(formId).trim()) continue;
    count++;
  }
  return count;
}

/** Admin menu flow: prompt for the exam and the new duration. */
function setExamDurationPrompt() {
  ensureSheets();
  var ui = SpreadsheetApp.getUi();

  var formInput = ui.prompt(
    'Set Exam Duration',
    'Paste the exam form URL or form ID (for example https://docs.google.com/forms/d/e/FORM_ID/viewform, or just FORM_ID).',
    ui.ButtonSet.OK_CANCEL
  );
  if (formInput.getSelectedButton() !== ui.Button.OK) return;
  var formRef = String(formInput.getResponseText() || '').trim();
  if (!formRef) {
    ui.alert('No exam entered', 'Paste the exam form URL or ID to continue.', ui.ButtonSet.OK);
    return;
  }
  var formId = extractFormId_(formRef);
  if (!formId) {
    ui.alert('Could not read that exam', "That doesn't look like a Google Forms URL or ID. Paste the full /forms/d/... URL to continue.", ui.ButtonSet.OK);
    return;
  }

  var durInput = ui.prompt(
    'Set Exam Duration',
    'New duration in minutes (10 to 480).',
    ui.ButtonSet.OK_CANCEL
  );
  if (durInput.getSelectedButton() !== ui.Button.OK) return;
  var minutes = Number(String(durInput.getResponseText() || '').trim());
  if (!(minutes >= 10 && minutes <= 480)) {
    ui.alert('Duration out of range', 'Duration needs to be between 10 and 480 minutes.', ui.ButtonSet.OK);
    return;
  }
  var durationMs = Math.round(minutes * 60000);

  var activeCount = countActiveSessionsForForm_(formId);
  var confirm = ui.alert(
    'Set exam duration?',
    'Set this exam to ' + minutes + ' minutes? ' +
      (activeCount > 0
        ? 'It will apply to ' + activeCount + ' active session' + (activeCount === 1 ? '' : 's') + ' and to future starts.'
        : 'There are no active sessions right now. It will apply to future starts.'),
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  var result = setExamDurationForForm(formId, formRef, durationMs);
  if (result.ok) {
    ui.alert(
      'Duration set',
      'Future starts will default to ' + minutes + ' minutes.' +
        (result.updated > 0
          ? ' ' + result.updated + ' active session' + (result.updated === 1 ? ' was' : 's were') + ' updated.'
          : ''),
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('Could not set duration', 'Something went wrong while setting the duration. Try again.', ui.ButtonSet.OK);
  }
}

/* ---- GRANT EXTRA TIME (mid-exam extensions) ---- */
/* Raising a running session's Duration (ms) is the extension mechanism:
   the student's client adopts the server value on its next reconcile poll
   (~60 s) and the countdown simply extends. Only Active sessions are ever
   touched; locked/submitted/expired rows are skipped, and the Exams sheet
   default (future starts) is never changed by a grant. */

/** Active Session IDs for a form (used by the whole-exam grant). */
function activeSessionIdsForForm_ (formId) {
  var out = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return out;
  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var col = function (name, fallback) {
    var x = header.indexOf(name);
    return (x !== -1) ? (x + 1) : fallback;
  };
  var COL_FORM_URL = col('Form URL', 4);
  var COL_STATUS   = col('Status', 7);
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][0] || '')) continue;
    if (String(rows[i][COL_STATUS - 1] || '').trim() !== 'Active') continue;
    if (extractFormId_(String(rows[i][COL_FORM_URL - 1] || '')) !== String(formId).trim()) continue;
    out.push(String(rows[i][0]).trim());
  }
  return out;
}

/**
 * Add minutes to running sessions. Returns { ok, requested, updated,
 * skipped, missing, minutes }. Also accumulates an audit-only
 * Extension (ms) column so grants are visible in the sheet.
 */
function grantTimeToSessions (sessionIds, minutes, reason) {
  sessionIds = sessionIds || [];
  minutes = Number(minutes);
  if (!sessionIds.length) return { ok: false, error: 'missing_sessionIds' };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360) {
    return { ok: false, error: 'invalid_minutes' };
  }

  return withLock_(function () {
    ensureSheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SESSIONS_SHEET);
    var rows = sheet.getDataRange().getValues();
    var header = rows[0] || [];
    var col = function (name, fallback) {
      var x = header.indexOf(name);
      return (x !== -1) ? (x + 1) : fallback;
    };
    var COL_STATUS   = col('Status', 7);
    var COL_DURATION = col('Duration (ms)', 10);
    var COL_EXT      = col('Extension (ms)', 11);

    var wanted = {};
    for (var w = 0; w < sessionIds.length; w++) wanted[String(sessionIds[w]).trim()] = true;

    var updated = 0, skipped = 0, missing = sessionIds.length, actualAddedMs = 0;
    for (var i = 1; i < rows.length; i++) {
      var sid = String(rows[i][0] || '').trim();
      if (!sid || !wanted[sid]) continue;
      missing--;
      if (String(rows[i][COL_STATUS - 1] || '').trim() !== 'Active') { skipped++; continue; }
      var cur = Number(rows[i][COL_DURATION - 1]) || 0;
      /* cap the total at the 8 h client maximum; only the real delta is
         recorded as extension */
      var next = Math.min(cur + minutes * 60000, 8 * 60 * 60 * 1000);
      var added = Math.max(0, next - cur);
      if (added <= 0) { skipped++; continue; }
      sheet.getRange(i + 1, COL_DURATION).setValue(next);
      sheet.getRange(i + 1, COL_EXT).setValue((Number(rows[i][COL_EXT - 1]) || 0) + added);
      updated++;
      actualAddedMs += added;
    }

    var by = getActorEmail_();
    logDebug_('INFO', 'admin_action', JSON.stringify({
      action: 'grant_time',
      minutes: minutes,
      actualAddedMs: actualAddedMs,
      requested: sessionIds.length,
      updated: updated,
      skipped: skipped,
      missing: missing,
      actor: by,
      reason: reason || '',
    }), '', '');

    return {
      ok: true,
      requested: sessionIds.length,
      updated: updated,
      skipped: skipped,
      missing: missing,
      minutes: minutes,
    };
  });
}

/** Plain-language result dialog for grant-time actions. */
function showGrantResult_ (ui, result, minutes) {
  if (result && result.ok) {
    var msg = 'Added ' + plural_(minutes || result.minutes, 'minute') + ' to ' +
      plural_(result.updated || 0, 'active session') + '.';
    if (result.skipped) msg += ' Skipped ' + plural_(result.skipped, 'session') + ' that is not running (locked, submitted, or ended).';
    if (result.missing) msg += ' ' + plural_(result.missing, 'ID') + ' not found.';
    msg += ' Students will see the extra time within about a minute.';
    ui.alert('Time granted', msg, ui.ButtonSet.OK);
  } else {
    ui.alert('Could not grant time', 'Nothing was changed. Try again, or check the Session IDs.', ui.ButtonSet.OK);
  }
}

/** Prompt for whole minutes; -1 means cancelled or invalid. */
function grantMinutesPrompt_ (ui) {
  var resp = ui.prompt('Grant Extra Time',
    'How many extra minutes should each student get? (1 to 360).',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return -1;
  var minutes = Number(String(resp.getResponseText() || '').trim());
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360) {
    ui.alert('Minutes out of range',
      'Enter a whole number of minutes between 1 and 360.', ui.ButtonSet.OK);
    return -1;
  }
  return minutes;
}

/** Grant time to one running session by Session ID. */
function grantTimeToSessionPrompt() {
  ensureSheets();
  var ui = SpreadsheetApp.getUi();
  var sidInput = ui.prompt('Grant Extra Time',
    'Enter the Session ID of the running exam:', ui.ButtonSet.OK_CANCEL);
  if (sidInput.getSelectedButton() !== ui.Button.OK) return;
  var sessionId = String(sidInput.getResponseText() || '').trim();
  if (!sessionId) return;
  var info = getSessionInfo_(sessionId);
  if (!info) {
    return ui.alert('Session not found',
      'No row for session ' + sessionId + ' in the Sessions sheet.', ui.ButtonSet.OK);
  }
  if (info.status !== 'Active') {
    return ui.alert('Not a running exam',
      'Session ' + sessionId + ' is ' + (info.status || 'not active') +
      '. Only active sessions can be extended.', ui.ButtonSet.OK);
  }
  var minutes = grantMinutesPrompt_(ui);
  if (minutes < 0) return;
  if (!confirmAction_(ui, 'Add time to this exam?',
    'Add ' + plural_(minutes, 'minute') + ' to the running exam for session ' + sessionId +
    ' (' + queueWhoLabel_(info) + ')? Their timer will extend; locked or submitted sessions are never changed.')) return;
  showGrantResult_(ui, grantTimeToSessions([sessionId], minutes, 'Grant time (session ID)'), minutes);
}

/** Grant time to selected sessions. */
function grantTimeFromSelection() {
  var ui = SpreadsheetApp.getUi();
  var ids = getSelectedSessionIds_();
  if (!ids.length) return ui.alert('No Session IDs found in your selection. Select cells that contain Session IDs (on any tab), or use the paste option.');
  if (!confirmLargeAction_(ui, ids.length, 'Grant extra time')) return;
  var minutes = grantMinutesPrompt_(ui);
  if (minutes < 0) return;
  if (!confirmAction_(ui, 'Add time to these exams?',
    'Add ' + plural_(minutes, 'minute') + ' to every active session among the ' +
    plural_(ids.length, 'selected ID') + '? Locked, submitted, or ended sessions are skipped.')) return;
  showGrantResult_(ui, grantTimeToSessions(ids, minutes, 'Grant time (selection)'), minutes);
}

/** Grant time to pasted sessions. */
function grantTimeByPastePrompt() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Grant Extra Time',
    'Paste Session IDs (newline or comma separated):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var ids = parseSessionIds_(resp.getResponseText());
  if (!ids.length) return ui.alert('No Session IDs provided.');
  if (!confirmLargeAction_(ui, ids.length, 'Grant extra time')) return;
  var minutes = grantMinutesPrompt_(ui);
  if (minutes < 0) return;
  if (!confirmAction_(ui, 'Add time to these exams?',
    'Add ' + plural_(minutes, 'minute') + ' to every active session among the ' +
    plural_(ids.length, 'pasted ID') + '? Locked, submitted, or ended sessions are skipped.')) return;
  showGrantResult_(ui, grantTimeToSessions(ids, minutes, 'Grant time (paste)'), minutes);
}

/** Grant the same extension to every student currently taking an exam. */
function grantTimeByFormPrompt() {
  ensureSheets();
  var ui = SpreadsheetApp.getUi();
  var formInput = ui.prompt('Grant Extra Time',
    'Paste the exam form URL or form ID to extend every student currently taking it:',
    ui.ButtonSet.OK_CANCEL);
  if (formInput.getSelectedButton() !== ui.Button.OK) return;
  var formRef = String(formInput.getResponseText() || '').trim();
  var formId = formRef ? extractFormId_(formRef) : '';
  if (!formId) {
    return ui.alert('Could not read that exam',
      "That doesn't look like a Google Forms URL or ID. Paste the full /forms/d/... URL to continue.",
      ui.ButtonSet.OK);
  }
  var ids = activeSessionIdsForForm_(formId);
  if (!ids.length) {
    return ui.alert('No students are taking that exam right now',
      'Only active sessions can be extended. Try again when students have started, or use the Session ID option for individuals.',
      ui.ButtonSet.OK);
  }
  var minutes = grantMinutesPrompt_(ui);
  if (minutes < 0) return;
  if (!confirmAction_(ui, 'Add time to this whole exam?',
    'Add ' + plural_(minutes, 'minute') + ' to the ' + plural_(ids.length, 'student') +
    ' currently taking this exam? Future starts are not affected.')) return;
  showGrantResult_(ui, grantTimeToSessions(ids, minutes, 'Grant time (exam form)'), minutes);
}

/* ---- Web App entry point ---- */
function doPost (e) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    logDebug_('ERROR', 'doPost_parse_error', String(err && err.message ? err.message : err), '', '');
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Invalid JSON' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (!data || typeof data !== 'object') {
    logDebug_('ERROR', 'doPost_missing_data', 'Payload is not an object or is missing', '', '');
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Missing or invalid payload' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var action = data.action || '';
  var result = null;

  switch (action) {

    case 'log_session':
      result = logSession(data);
      break;

    case 'log_violation':
      result = logViolation(data);
      break;

    case 'log_audit':
      result = logAudit(data);
      break;

    case 'end_session':
      result = endSession(data);
      break;

    default:
      logDebug_('ERROR', 'doPost_unknown_action', 'Unknown action: ' + action, '', '');
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: 'Unknown action: ' + action })
      ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify(result || { ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}

/* ---- LOG SESSION START ---- */
function logSession (data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  var nowIso = new Date().toISOString();

  /* Anti-bypass: reject a second ACTIVE session for the same student + form
     (storage wipe, deliberate restart, second tab). The client then resumes
     the existing session instead of starting a competing one. */
  var existing = findActiveSession_(
    String(data.studentEmail || '').toLowerCase(),
    extractFormId_(String(data.formUrl || ''))
  );
  if (existing) {
    logDebug_('WARN', 'log_session_duplicate_blocked',
      'Duplicate active session rejected; resuming existing',
      existing.sessionId, data.studentEmail);
    return { ok: true, duplicate: true, session: existing };
  }

  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = new Array(header.length).fill('');
  var set = function (name, value) {
    var idx = header.indexOf(name);
    if (idx !== -1) row[idx] = value;
  };

  set('Session ID', data.sessionId || '');
  set('Student Name', data.studentName || '');
  set('Student Email', data.studentEmail || '');
  set('Form URL', data.formUrl || '');
  set('Start Time', nowIso); // server-authoritative (blocks clock rollback)
  set('End Time', '');
  set('Status', 'Active');
  set('Violation Count', 0);
  set('End Reason', '');
  set('Duration (ms)', data.durationMs || '');

  sheet.appendRow(row);

  return {
    ok: true,
    session: {
      sessionId      : data.sessionId || '',
      studentName    : data.studentName || '',
      studentEmail   : data.studentEmail || '',
      formUrl        : data.formUrl || '',
      startTime      : nowIso,
      status         : 'Active',
      violationCount : 0,
      durationMs     : Number(data.durationMs || 0),
      reason         : '',
    },
  };
}

function getViolationsForSession_(sessionId) {
  if (!sessionId) return [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === sessionId && isActualViolationRow_(rows[i][3])) {
      out.push({
        timestamp: rows[i][0],
        sessionId: rows[i][1],
        studentName: rows[i][2],
        type: rows[i][3],
        severity: rows[i][4],
        details: rows[i][5]
      });
    }
  }
  return out;
}

function sendViolationReportEmail_(toEmail, sessionId, studentName) {
  if (!toEmail) return { ok: false, error: 'missing toEmail' };

  var violations = getViolationsForSession_(sessionId);
  if (!violations || violations.length === 0) return { ok: true, sent: false, reason: 'no_violations' };

  var subject = 'CRC Exam Violations Report';
  var lines = [];
  lines.push('This is an automated report of exam violations detected during your session.');
  lines.push('');
  lines.push('Student: ' + (studentName || ''));
  lines.push('Session ID: ' + (sessionId || ''));
  lines.push('Total Violations: ' + violations.length);
  lines.push('');
  lines.push('Violations:');
  for (var i = 0; i < violations.length; i++) {
    var v = violations[i];
    lines.push(
      (i + 1) + ') ' +
      '[' + (v.timestamp || '') + '] ' +
      (v.type || '') + ' (' + (v.severity || '') + '): ' +
      (v.details || '')
    );
  }
  var body = lines.join('\n');

  try {
    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: body,
    });
    return { ok: true, sent: true, count: violations.length };
  } catch (err) {
    Logger.log('Email send failed: ' + String(err && err.message ? err.message : err));
    return { ok: false, error: 'email_send_failed', message: String(err && err.message ? err.message : err) };
  }
}

function logDebug_(level, event, details, optSessionId, optStudentEmail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DEBUGLOG_SHEET);
  if (!sheet) return;

  sheet.appendRow([
    new Date().toISOString(),
    level || 'INFO',
    event || '',
    details || '',
    optSessionId || '',
    optStudentEmail || ''
  ]);
}

function getActorEmail_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email || 'admin';
  } catch (e) {
    return 'admin';
  }
}

function parseSessionIds_(text) {
  if (!text) return [];
  var parts = String(text)
    .split(/[\n\r,\t ]+/g)
    .map(function (s) { return String(s || '').trim(); })
    .filter(function (s) { return !!s; });

  var seen = {};
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (seen[parts[i]]) continue;
    seen[parts[i]] = true;
    out.push(parts[i]);
  }
  return out;
}

function getKnownSessionIdSet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return {};
  var rows = sheet.getDataRange().getValues();
  var set = {};
  for (var i = 1; i < rows.length; i++) {
    var sid = rows[i][0];
    if (sid) set[String(sid).trim()] = true;
  }
  return set;
}

function getSelectedSessionIds_() {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var range;
  try { range = ss.getActiveRange(); } catch (e) { range = null; }
  if (!range) return [];

  var activeSheet = range.getSheet();
  var values = range.getValues();

  // If selecting rows on Sessions, prefer using the Session ID column by header.
  if (activeSheet && activeSheet.getName && activeSheet.getName() === SESSIONS_SHEET) {
    var header = activeSheet.getRange(1, 1, 1, activeSheet.getLastColumn()).getValues()[0];
    var sidIdx = header.indexOf('Session ID');
    if (sidIdx !== -1) {
      var startRow = range.getRow();
      var endRow = startRow + range.getNumRows() - 1;
      var sidCol = sidIdx + 1;
      var sidRange = activeSheet.getRange(startRow, sidCol, endRow - startRow + 1, 1).getValues();
      var sids = [];
      for (var r = 0; r < sidRange.length; r++) {
        var sid = sidRange[r][0];
        if (sid) sids.push(String(sid).trim());
      }
      return parseSessionIds_(sids.join('\n'));
    }
  }

  // Otherwise: scan selected cells and match against known session IDs.
  var known = getKnownSessionIdSet_();
  var found = [];
  for (var i = 0; i < values.length; i++) {
    for (var j = 0; j < values[i].length; j++) {
      var v = values[i][j];
      if (!v) continue;
      var s = String(v).trim();
      if (known[s]) found.push(s);
    }
  }
  return parseSessionIds_(found.join('\n'));
}

function purgeViolationsForSessions_(sessionIds) {
  if (!sessionIds || sessionIds.length === 0) return { ok: true, deleted: 0 };
  var set = {};
  for (var i = 0; i < sessionIds.length; i++) set[sessionIds[i]] = true;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return { ok: false, error: 'Violations sheet missing' };

  var data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return { ok: true, deleted: 0 };

  var toDelete = [];
  for (var r = 1; r < data.length; r++) {
    if (set[data[r][1]] && isActualViolationRow_(String(data[r][3] || ''))) {
      toDelete.push(r + 1); // +1 for 1-based row numbers
    }
  }

  // Delete rows in reverse order to maintain indices
  for (var i = toDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(toDelete[i]);
  }
  
  return { ok: true, deleted: toDelete.length };
}

function setClearMarkersBatch_(sessionIds, reason) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  if (!sessionIds || sessionIds.length === 0) return { ok: true, updated: 0, appended: 0, now: '' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RESETS_SHEET);
  if (!sheet) return { ok: false, error: 'Resets sheet missing' };

  var rows = sheet.getDataRange().getValues();
  var index = {};
  for (var i = 1; i < rows.length; i++) {
    var sid = rows[i][0];
    if (sid) index[String(sid).trim()] = i + 1; // sheet row
  }

  var now = new Date().toISOString();
  var by = getActorEmail_();
  var updated = 0;
  var toAppend = [];

  for (var j = 0; j < sessionIds.length; j++) {
    var s = sessionIds[j];
    var row = index[s];
    if (row) {
      sheet.getRange(row, 2, 1, 3).setValues([[now, by, reason || '']]);
      updated++;
    } else {
      toAppend.push([s, now, by, reason || '']);
    }
  }

  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 4).setValues(toAppend);
  }
  return { ok: true, updated: updated, appended: toAppend.length, now: now };
}

function clearViolationsForSessions(sessionIds, reason) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  sessionIds = sessionIds || [];
  if (sessionIds.length === 0) return { ok: false, error: 'no_sessionIds' };

  return withLock_(function () {
    var actor = getActorEmail_();
    var markerRes = setClearMarkersBatch_(sessionIds, reason || 'Bulk clear violations');
    var purgeRes = purgeViolationsForSessions_(sessionIds);

    // Set Violation Count to 0 for these sessions.
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
    var sessionRows = sessionsSheet.getDataRange().getValues();
    var header = sessionRows[0] || [];
    var sidIdx = header.indexOf('Session ID');
    var vcIdx = header.indexOf('Violation Count');
    if (sidIdx === -1) sidIdx = 0;
    if (vcIdx === -1) vcIdx = 7; // fallback

    var set = {};
    for (var i = 0; i < sessionIds.length; i++) set[sessionIds[i]] = true;
    var found = 0;
    for (var r = 1; r < sessionRows.length; r++) {
      var sid = String(sessionRows[r][sidIdx] || '').trim();
      if (sid && set[sid]) {
        sessionsSheet.getRange(r + 1, vcIdx + 1).setValue(0);
        found++;
      }
    }

    logDebug_('INFO', 'admin_action', JSON.stringify({
      action: 'bulk_clear_violations',
      requestedCount: sessionIds.length,
      sessionsUpdated: found,
      deletedViolationRows: purgeRes.deleted || 0,
      actor: actor,
    }), '', '');

    return {
      ok: true,
      requestedCount: sessionIds.length,
      sessionsUpdated: found,
      deletedViolationRows: purgeRes.deleted || 0,
      clearedAt: markerRes.now || '',
    };
  });
}

function unlockSessions(sessionIds, reason) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  sessionIds = sessionIds || [];
  if (sessionIds.length === 0) return { ok: false, error: 'no_sessionIds' };

  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(UNLOCKS_SHEET);
    var rows = sheet.getDataRange().getValues();
    var now = new Date().toISOString();
    var by = getActorEmail_();

    var index = {};
    for (var i = 1; i < rows.length; i++) {
      var sid = rows[i][0];
      if (sid) index[String(sid).trim()] = i + 1;
    }

    var updated = 0;
    var toAppend = [];
    for (var j = 0; j < sessionIds.length; j++) {
      var s = sessionIds[j];
      var row = index[s];
      if (row) {
        sheet.getRange(row, 2, 1, 4).setValues([[true, now, by, reason || '']]);
        updated++;
      } else {
        toAppend.push([s, true, now, by, reason || '']);
      }
    }

    if (toAppend.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 5).setValues(toAppend);
    }

    /* Reset each Sessions row so reconciliation does not re-lock them */
    for (var k = 0; k < sessionIds.length; k++) {
      setSessionStatus_(sessionIds[k], 'Active', '', '');
    }

    logDebug_('INFO', 'admin_action', JSON.stringify({
      action: 'bulk_unlock',
      requestedCount: sessionIds.length,
      updated: updated,
      appended: toAppend.length,
      actor: by,
    }), '', '');

    return {
      ok: true,
      requestedCount: sessionIds.length,
      updated: updated,
      appended: toAppend.length,
      unlockedAt: now,
    };
  });
}

function getLockedViolationSessionIds_() {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];

  var sidIdx = header.indexOf('Session ID');
  var statusIdx = header.indexOf('Status');
  var reasonIdx = header.indexOf('End Reason');
  if (sidIdx === -1) sidIdx = 0;

  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var sid = String(rows[i][sidIdx] || '').trim();
    if (!sid) continue;
    var status = statusIdx !== -1 ? String(rows[i][statusIdx] || '').trim() : '';
    var reason = reasonIdx !== -1 ? String(rows[i][reasonIdx] || '').trim() : '';
    if (status === 'Locked (Violations)' || reason === 'max_violations') out.push(sid);
  }
  return parseSessionIds_(out.join('\n'));
}

function confirmLargeAction_(ui, count, actionName) {
  if (count <= 500) return true;
  var resp = ui.alert(
    'Confirm Bulk Action',
    actionName + ' will affect ' + count + ' sessions. Continue?',
    ui.ButtonSet.OK_CANCEL
  );
  return resp === ui.Button.OK;
}

function plural_(n, word) {
  return n === 1 ? '1 ' + word : n + ' ' + word + 's';
}

/** OK/Cancel confirmation; OK means "yes, do it". */
function confirmAction_(ui, title, detail) {
  return ui.alert(title, detail, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
}

/** Count real violation rows (markers and suppressed events excluded). */
function countViolationRows_(sessionId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return 0;
  var rows = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < rows.length; i++) {
    if (sessionId && String(rows[i][1] || '').trim() !== String(sessionId).trim()) continue;
    if (isActualViolationRow_(String(rows[i][3] || ''))) count++;
  }
  return count;
}

/** Plain-language result dialog for bulk/single unlock actions. */
function showUnlockResult_(ui, result) {
  if (result && result.ok) {
    if (result.requestedCount !== undefined) {
      ui.alert(
        'Sessions unlocked',
        'Unlocked ' + plural_(result.requestedCount || 0, 'session') + '. They can now resume their exams.',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        'Session unlocked',
        'Unlocked session ' + result.sessionId + '. They can now resume the exam.',
        ui.ButtonSet.OK
      );
    }
  } else {
    ui.alert('Could not unlock', 'Nothing was changed. Try again, or check the Session IDs.', ui.ButtonSet.OK);
  }
  try { refreshReviewQueue_(); } catch (e) { /* keep the queue current */ }
}

/** Plain-language result dialog for bulk/single clear-violations actions. */
function showClearResult_(ui, result, scopeLabel) {
  if (result && result.ok) {
    var records = (result.deletedViolationRows !== undefined ? result.deletedViolationRows : result.deleted) || 0;
    var sessions = result.sessionsUpdated !== undefined ? result.sessionsUpdated : 1;
    var where = scopeLabel || '';
    ui.alert(
      'Violations cleared',
      'Cleared violations ' + (where ? 'for ' + where + ' ' : '') +
        'and removed ' + plural_(records || 0, 'record') +
        (result.sessionsUpdated !== undefined ? ' from ' + plural_(sessions || 0, 'session') + '. Counts are reset to 0.' : '. The count is reset to 0.'),
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('Could not clear violations', 'Nothing was changed. Try again, or check the Session IDs.', ui.ButtonSet.OK);
  }
  try { refreshReviewQueue_(); } catch (e) { /* keep the queue current */ }
}

function bulkClearViolationsFromSelection() {
  var ui = SpreadsheetApp.getUi();
  var ids = getSelectedSessionIds_();
  if (!ids.length) return ui.alert('No Session IDs found in your selection. Select cells that contain Session IDs (on any tab), or use the paste option.');
  if (!confirmAction_(ui, 'Clear violations?',
    'Clear all violations for ' + plural_(ids.length, 'session') + '? Their violation records are permanently deleted and counts reset to 0.')) return;
  var result = clearViolationsForSessions(ids, 'Bulk clear (selection)');
  showClearResult_(ui, result, '');
}

function bulkUnlockFromSelection() {
  var ui = SpreadsheetApp.getUi();
  var ids = getSelectedSessionIds_();
  if (!ids.length) return ui.alert('No Session IDs found in your selection. Select cells that contain Session IDs (on any tab), or use the paste option.');
  if (!confirmLargeAction_(ui, ids.length, 'Bulk unlock')) return;
  var result = unlockSessions(ids, 'Bulk unlock (selection)');
  showUnlockResult_(ui, result);
}

function bulkClearViolationsByPastePrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Bulk Clear Violations', 'Paste Session IDs (newline or comma separated):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var ids = parseSessionIds_(response.getResponseText());
  if (!ids.length) return ui.alert('No Session IDs provided.');
  if (!confirmAction_(ui, 'Clear violations?',
    'Clear all violations for ' + plural_(ids.length, 'session') + '? Their violation records are permanently deleted and counts reset to 0.')) return;
  var result = clearViolationsForSessions(ids, 'Bulk clear (paste)');
  showClearResult_(ui, result, '');
}

function bulkUnlockByPastePrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Bulk Unlock Sessions', 'Paste Session IDs (newline or comma separated):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var ids = parseSessionIds_(response.getResponseText());
  if (!ids.length) return ui.alert('No Session IDs provided.');
  if (!confirmLargeAction_(ui, ids.length, 'Bulk unlock')) return;
  var result = unlockSessions(ids, 'Bulk unlock (paste)');
  showUnlockResult_(ui, result);
}

function bulkUnlockAllLockedViolations() {
  var ui = SpreadsheetApp.getUi();
  var ids = getLockedViolationSessionIds_();
  if (!ids.length) return ui.alert('No sessions are currently marked as Locked (Violations).');
  if (!confirmAction_(ui, 'Unlock all locked sessions?',
    'Unlock ' + plural_(ids.length, 'session') + ' that are currently locked for violations? They will be able to resume their exams.')) return;
  var result = unlockSessions(ids, 'Bulk unlock: Locked (Violations)');
  showUnlockResult_(ui, result);
}

/* ---- LOG VIOLATION ---- */
function logViolation (data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);

  sheet.appendRow([
    data.timestamp   || new Date().toISOString(),
    data.sessionId   || '',
    data.studentName || '',
    data.violation   || data.type || '',
    data.severity    || '',
    data.details     || ''
  ]);

  /* Update the Sessions violation count — but only when this row is a
     real violation (never markers or *_suppressed events) */
  if (data.sessionId && isActualViolationRow_(data.violation || data.type)) {
    updateSessionViolationCount(data.sessionId);
  }
}

/* Non-violation audit entries (system interruptions etc.) → DebugLog */
function logAudit (data) {
  logDebug_('INFO',
    String(data.event || 'audit_event'),
    String(data.details || ''),
    data.sessionId || '',
    data.studentEmail || ''
  );
  return { ok: true };
}

/* ---- END SESSION ---- */
function endSession (data) {
  if (!data || typeof data !== 'object') {
    logDebug_('ERROR', 'end_session_invalid_data', 'Payload is not an object or is missing', '', '');
    return { ok: false, error: 'Invalid payload' };
  }
  if (!data.sessionId) {
    logDebug_('ERROR', 'end_session_missing_sessionId', 'Payload missing sessionId', '', '');
    return { ok: false, error: 'Missing sessionId' };
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  var rows  = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var col = function (name, fallback) {
    var idx = header.indexOf(name);
    return (idx !== -1) ? (idx + 1) : fallback;
  };

  var COL_SESSION_ID = col('Session ID', 1);
  var COL_EMAIL      = col('Student Email', 3);
  var COL_END_TIME   = col('End Time', 5);
  var COL_STATUS     = col('Status', 6);
  var COL_END_REASON = col('End Reason', 8);
  var COL_DURATION   = col('Duration (ms)', 10);

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][COL_SESSION_ID - 1] === data.sessionId) {
      var row = i + 1;  // 1-indexed
      sheet.getRange(row, COL_END_TIME).setValue(data.endTime || new Date().toISOString());

      if (data.studentEmail) {
        sheet.getRange(row, COL_EMAIL).setValue(data.studentEmail);
      }
      if (data.durationMs) {
        sheet.getRange(row, COL_DURATION).setValue(data.durationMs);
      }

      /* First finalize wins. If the row already has an End Time, it was
         already finalized (e.g. Locked (Violations)) — a later failsafe
         landing (tab_closed, submitted) must never overwrite that terminal
         status nor send a second violation email. Admin unlocks reset the
         End Time, so an unlocked session can still be finalized normally. */
      var alreadyFinalized = String(rows[i][COL_END_TIME - 1] || '') !== '';

      var emailResult = { ok: false, error: 'not_attempted' };
      if (alreadyFinalized) {
        /* Duplicate end_session (failsafe landing twice) — keep the row
           updated, but preserve the terminal status and skip the repeat
           violation email. */
        emailResult = { ok: true, sent: false, reason: 'already_finalized' };
        logDebug_(
          'INFO',
          'end_session_duplicate_skipped',
          'Session already finalized; preserving status',
          data.sessionId,
          data.studentEmail
        );
      } else {
        var reason = data.reason || 'unknown';
        var status = statusForReason_(reason);
        sheet.getRange(row, COL_STATUS).setValue(status);
        sheet.getRange(row, COL_END_REASON).setValue(reason);

        if (data.studentEmail) {
          emailResult = sendViolationReportEmail_(data.studentEmail, data.sessionId, data.student || data.studentName || '');
          logDebug_(
            emailResult.ok ? 'INFO' : 'ERROR',
            'end_session_email',
            JSON.stringify(emailResult),
            data.sessionId,
            data.studentEmail
          );
        } else {
          logDebug_(
            'WARN',
            'end_session_email_skipped',
            'No studentEmail provided',
            data.sessionId,
            ''
          );
        }
      }

      // Return email status in response for client-side feedback (if called via GET)
      return { ok: true, emailResult: emailResult };
    }
  }
  logDebug_('ERROR', 'end_session_not_found', 'Session not found for sessionId: ' + data.sessionId, data.sessionId, '');
  return { ok: false, error: 'session_not_found' };
}

/* ---- UPDATE VIOLATION COUNT ---- */
function updateSessionViolationCount (sessionId) {
  if (!sessionId) return;
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  var rows  = sheet.getDataRange().getValues();

  var header = rows[0] || [];
  var countCol = header.indexOf('Violation Count');
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      /* recompute from real violation rows only; column by header so the
         Status column is never clobbered */
      sheet.getRange(i + 1, countCol !== -1 ? countCol + 1 : 8).setValue(recomputeViolationCount_(sessionId));
      return;
    }
  }
}

/* ---- ADMIN FUNCTIONS ---- */

// Clear all violations for a specific session
function clearViolationsForSession(sessionId) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  if (!sessionId) return { ok: false, error: 'missing sessionId' };

  return withLock_(function () {
    // 1) Write reset marker for client-side convergence
    var cleared = setClearMarker_(sessionId, 'Clear violations');

    // 2) Delete matching rows from Violations sheet
    var purgeResult = purgeViolationsForSession_(sessionId);

    // 3) Reset the session's violation count to 0
    recomputeViolationCount_(sessionId);

    return {
      ok: true,
      cleared: true,
      sessionId: sessionId,
      clearedAt: cleared.clearedAt || '',
      deleted: purgeResult.deleted || 0
    };
  });
}

function unlockSession(sessionId, reason) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  if (!sessionId) return { ok: false, error: 'missing sessionId' };

  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(UNLOCKS_SHEET);
    var rows = sheet.getDataRange().getValues();
    var now = new Date().toISOString();
    var by = 'admin';

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === sessionId) {
        sheet.getRange(i + 1, 2).setValue(true);
        sheet.getRange(i + 1, 3).setValue(now);
        sheet.getRange(i + 1, 4).setValue(by);
        sheet.getRange(i + 1, 5).setValue(reason || '');
        /* Reset the Sessions row so the student can continue and so
           client reconciliation does not re-lock them. */
        setSessionStatus_(sessionId, 'Active', '', '');
        return { ok: true, sessionId: sessionId, unlocked: true };
      }
    }

    sheet.appendRow([sessionId, true, now, by, reason || '']);
    setSessionStatus_(sessionId, 'Active', '', '');
    return { ok: true, sessionId: sessionId, unlocked: true };
  });
}

function isSessionUnlocked(sessionId) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(UNLOCKS_SHEET);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      return !!rows[i][1];
    }
  }
  return false;
}

// Clear all violations (admin reset)
function clearAllViolations() {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();

  var ui = SpreadsheetApp.getUi();
  var total = countViolationRows_(null);
  if (!confirmAction_(ui, 'Clear all violations?',
    'Permanently delete every violation record (' + plural_(total, 'record') + ') and reset every session count to 0? This cannot be undone.')) return;

  var result = withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
    var sessionRows = sessionsSheet.getDataRange().getValues();

    // 1) Delete all violation rows (except header)
    var purgeResult = purgeAllViolations_();

    // 2) Reset all session violation counts to 0 (column looked up by header
    //    so the Status column is never clobbered)
    var sHeader = sessionRows[0] || [];
    var countCol = sHeader.indexOf('Violation Count');
    for (var j = 1; j < sessionRows.length; j++) {
      if (countCol !== -1) sessionsSheet.getRange(j + 1, countCol + 1).setValue(0);
    }

    // 3) Write reset markers for all sessions (optional, for future consistency)
    var now = new Date().toISOString();
    for (var i = 1; i < sessionRows.length; i++) {
      var sid = sessionRows[i][0];
      if (sid) setClearMarker_(sid, 'Clear all violations');
    }

    return {
      ok: true,
      cleared: true,
      clearedAt: now,
      deleted: purgeResult.deleted || 0,
      message: 'All violations cleared'
    };
  });

  if (result && result.ok) {
    ui.alert('Violations cleared',
      'Cleared all violations: removed ' + plural_(result.deleted || 0, 'record') + ' and reset every session count to 0.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('Could not clear violations', 'Nothing was changed. Try again.', ui.ButtonSet.OK);
  }
  try { refreshReviewQueue_(); } catch (e) { /* keep the queue current */ }
}

/* ---- REVIEW QUEUE (invigilator nudges) ---- */
/* A live, derived "what needs me now" sheet: locked sessions at the top
   ordered by how long they have been waiting (oldest first, red fills that
   darken past 10 minutes), then flagged-but-still-running sessions. Row
   actions unlock or clear-a-false-positive-and-unlock without copy/paste. */

var REVIEW_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Parse an ISO string, Date object, or epoch number into a Date. */
function parseDateValue_(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  var t = Date.parse(String(v));
  return isNaN(t) ? null : new Date(t);
}

function fmtStamp_(d) {
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return REVIEW_MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' +
    p(d.getHours()) + ':' + p(d.getMinutes());
}

/** Compact human age: '<1m', '25m', '3h 10m', '2d 4h'. */
function fmtAgeHuman_(ms) {
  if (!(ms >= 0) || !isFinite(ms)) return '';
  if (ms < 60000) return '<1m';
  var total = Math.floor(ms / 60000);
  var days = Math.floor(total / 1440);
  var hours = Math.floor((total % 1440) / 60);
  var mins = total % 60;
  if (days > 0) return days + 'd ' + hours + 'h';
  if (hours > 0) return mins > 0 ? hours + 'h ' + mins + 'm' : hours + 'h';
  return mins + 'm';
}

/** Count sessions that need attention: locked, or active with flags. */
function reviewQueueCounts_() {
  var counts = { locked: 0, flagged: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return counts;
  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var iStatus = header.indexOf('Status');
  var iReason = header.indexOf('End Reason');
  var iCount = header.indexOf('Violation Count');
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    var status = String(rows[i][iStatus] || '').trim();
    var reason = iReason !== -1 ? String(rows[i][iReason] || '').trim() : '';
    var count = Number(rows[i][iCount] || 0) || 0;
    if (status === 'Locked (Violations)' || reason === 'max_violations') counts.locked++;
    else if (status === 'Active' && count > 0) counts.flagged++;
  }
  return counts;
}

/** Map sessionId -> most recent real violation (markers/suppressed excluded). */
function latestViolationMap_() {
  var map = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return map;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var type = String(rows[i][3] || '').trim();
    if (!isActualViolationRow_(type)) continue;
    var sid = String(rows[i][1] || '').trim();
    if (!sid) continue;
    var d = parseDateValue_(rows[i][0]);
    var t = d ? d.getTime() : 0;
    var cur = map[sid];
    if (!cur || t > cur.ts) {
      map[sid] = { type: type, details: String(rows[i][5] || ''), ts: t };
    }
  }
  return map;
}

/** Sessions needing review, most urgent first (locked by waiting time). */
function reviewQueueRows_() {
  var out = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return out;
  var rows = sheet.getDataRange().getValues();
  var header = rows[0] || [];
  var idx = function (name) { return header.indexOf(name); };
  var iName = idx('Student Name'), iEmail = idx('Student Email');
  var iStatus = idx('Status'), iCount = idx('Violation Count');
  var iStart = idx('Start Time'), iEnd = idx('End Time');
  var iDur = idx('Duration (ms)'), iExt = idx('Extension (ms)');
  var iReason = idx('End Reason');
  var now = Date.now();
  var latest = latestViolationMap_();

  for (var i = 1; i < rows.length; i++) {
    var sid = String(rows[i][0] || '').trim();
    if (!sid) continue;
    var status = String(rows[i][iStatus] || '').trim();
    var reason = iReason !== -1 ? String(rows[i][iReason] || '').trim() : '';
    var count = Number(rows[i][iCount] || 0) || 0;
    var locked = status === 'Locked (Violations)' || reason === 'max_violations';
    var flaggedActive = status === 'Active' && count > 0;
    if (!locked && !flaggedActive) continue;

    var viol = latest[sid];
    /* A locked session's waiting clock starts when it was locked (End Time). */
    var sinceDate = parseDateValue_(rows[i][iEnd]);
    if (!sinceDate && viol && viol.ts) sinceDate = new Date(viol.ts);
    if (!sinceDate) sinceDate = parseDateValue_(rows[i][iStart]);
    var waitMs = sinceDate ? now - sinceDate.getTime() : -1;

    /* Time left on the real clock (start + duration - now). It keeps
       declining while a student is locked out too, which is exactly what an
       invigilator needs when sizing a grant: an unlock alone may not leave
       enough time, and an "Expired" row should get time before it is
       unlocked. */
    var startDate = parseDateValue_(rows[i][iStart]);
    var durationMs = Number(rows[i][iDur] || 0) || 0;
    var remainingMs = (startDate && durationMs > 0)
      ? durationMs - (now - startDate.getTime()) : -1;
    var timeLeftText = remainingMs > 0 ? fmtAgeHuman_(remainingMs)
      : remainingMs === -1 ? '' : 'Expired';

    /* Granted chip: cumulative extra time this session already received
       (the Sessions Extension (ms) audit column). Blank when none, so a
       grant stands out and no-grant rows stay quiet. */
    var extMs = iExt !== -1 ? Number(rows[i][iExt] || 0) || 0 : 0;
    var grantedText = extMs > 0 ? '+' + fmtAgeHuman_(extMs) : '';

    var flagText = '';
    if (viol) {
      flagText = viol.type;
      var det = String(viol.details || '').trim();
      if (det) flagText += ' \u2014 ' + (det.length > 44 ? det.slice(0, 44) + '\u2026' : det);
    } else if (locked) {
      flagText = '\u2014';
    }

    out.push({
      sid: sid,
      name: String(rows[i][iName] || ''),
      email: String(rows[i][iEmail] || ''),
      locked: locked,
      count: count,
      timeLeftText: timeLeftText,
      grantedText: grantedText,
      statusText: locked ? 'Locked (Violations)' : 'Active with flags',
      sinceText: sinceDate ? fmtStamp_(sinceDate) : '',
      waitMs: waitMs,
      waitText: waitMs >= 0 ? fmtAgeHuman_(waitMs) : '',
      flagText: flagText,
      nextText: locked ? 'Unlock \u00b7 or Clear + Unlock' : 'Watch (not locked)',
    });
  }

  out.sort(function (a, b) {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    if (a.locked) return (b.waitMs - a.waitMs) || (b.count - a.count);
    return (b.count - a.count) || (b.waitMs - a.waitMs);
  });
  return out;
}

/** Rewrite the Review Queue sheet from current state. Returns item count. */
function refreshReviewQueue_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REVIEW_SHEET);
  if (!sheet) return 0;
  var items = reviewQueueRows_();
  var grid = [REVIEW_HEADERS.slice()];
  var fills = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    grid.push([it.sid, it.name, it.email, it.statusText, it.count,
      it.timeLeftText, it.grantedText, it.sinceText, it.waitText,
      it.flagText, it.nextText]);
    fills.push(it.locked && it.waitMs >= LOCKED_STALE_MS ? LOCKED_STALE_FILL :
      it.locked ? LOCKED_FILL : WATCH_FILL);
  }
  if (!items.length) {
    grid.push(['\uD83C\uDF89 All clear \u2014 no locked sessions and no active flags.',
      '', '', '', '', '', '', '', '', '', '']);
    fills.push(CLEAR_FILL);
  }
  writeQueueGrid_(sheet, grid, fills);
  return items.length;
}

function writeQueueGrid_(sheet, grid, fills) {
  var need = grid.length;
  var cols = grid[0].length;
  if (need > sheet.getMaxRows()) {
    sheet.insertRows(sheet.getMaxRows(), need - sheet.getMaxRows() + 10);
  }
  sheet.clear();
  for (var i = 0; i < grid.length; i++) sheet.appendRow(grid[i]);
  sheet.getRange(1, 1, 1, cols).setFontWeight('bold');
  sheet.setFrozenRows(1);
  for (var j = 0; j < fills.length; j++) {
    if (fills[j]) sheet.getRange(2 + j, 1, 1, cols).setBackground(fills[j]);
  }
  /* Keep the sheet small: leave a 10-row buffer, drop the rest so the
     spreadsheet stays well under the cell limit. */
  var surplus = sheet.getMaxRows() - need - 10;
  if (surplus > 0) sheet.deleteRows(need + 1, surplus);
}

function showReviewQueue() {
  ensureSheets();
  refreshReviewQueue_();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(REVIEW_SHEET);
    if (sheet) ss.setActiveSheet(sheet);
  } catch (e) { /* cosmetic */ }
}

/** Read the Session ID from the selected Review Queue row (column A). */
function queueSelectedSessionId_(ui) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  if (!sheet || String(sheet.getName() || '') !== REVIEW_SHEET) {
    ui.alert('Select a queue row first',
      'Go to the Review Queue tab and select the row of the session you want to act on.',
      ui.ButtonSet.OK);
    return '';
  }
  var range = sheet.getActiveRange();
  var row = range ? range.getRowIndex() : 0;
  if (row <= 1) {
    ui.alert('Select a session row',
      'Row 1 is the header. Select a session row below it.', ui.ButtonSet.OK);
    return '';
  }
  var sid = String(sheet.getRange(row, 1).getValue() || '').trim();
  if (!sid) {
    ui.alert('No Session ID in that row',
      'Could not read a Session ID from the selected row. Refresh the queue and try again.',
      ui.ButtonSet.OK);
    return '';
  }
  return sid;
}

function queueWhoLabel_(info) {
  if (!info) return '';
  return info.studentName ? info.studentName + ' (' + info.studentEmail + ')' : info.studentEmail;
}

/** Queue Row action 1: unlock without clearing the violation record. */
function reviewSelectedUnlock() {
  var ui = SpreadsheetApp.getUi();
  var sid = queueSelectedSessionId_(ui);
  if (!sid) return;
  var info = getSessionInfo_(sid);
  if (!info) {
    return ui.alert('Session not found',
      'No row for session ' + sid + ' in the Sessions sheet. Refresh the queue.', ui.ButtonSet.OK);
  }
  if (info.status !== 'Locked (Violations)') {
    return ui.alert('Nothing to unlock',
      'Session ' + sid + ' is ' + (info.status || 'not locked') +
      '. Only locked sessions can be unlocked from the queue.', ui.ButtonSet.OK);
  }
  if (!confirmAction_(ui, 'Unlock this session?',
    'Unlock session ' + sid + ' (' + queueWhoLabel_(info) +
    ')? They can resume the exam right away. Violation records stay on file for the audit log.')) return;
  showUnlockResult_(ui, unlockSession(sid, 'Review queue: unlock'));
  refreshReviewQueue_();
}

/** Queue Row action 2: clear a false positive, then unlock, in one step. */
function reviewSelectedClearAndUnlock() {
  var ui = SpreadsheetApp.getUi();
  var sid = queueSelectedSessionId_(ui);
  if (!sid) return;
  var info = getSessionInfo_(sid);
  if (!info) {
    return ui.alert('Session not found',
      'No row for session ' + sid + ' in the Sessions sheet. Refresh the queue.', ui.ButtonSet.OK);
  }
  if (info.status !== 'Locked (Violations)') {
    return ui.alert('Nothing to clear',
      'Session ' + sid + ' is ' + (info.status || 'not locked') +
      '. If a false positive fired while the exam is running, use Clear Violations by Session ID instead.',
      ui.ButtonSet.OK);
  }
  var records = countViolationRows_(sid);
  if (!confirmAction_(ui, 'Clear false positive and unlock?',
    'Permanently delete ' + plural_(records, 'violation record') + ' for locked session ' + sid +
    ' (' + queueWhoLabel_(info) + ') and unlock the exam so they can resume? ' +
    'Use this only when the flags were NOT real violations. The unlock entry stays in the audit log.')) return;
  var cleared = clearViolationsForSession(sid);
  if (!cleared || !cleared.ok) {
    return ui.alert('Could not clear', 'Nothing was changed. Try again.', ui.ButtonSet.OK);
  }
  var unlocked = unlockSession(sid, 'Review queue: clear false positive + unlock');
  if (unlocked && unlocked.ok) {
    ui.alert('Session cleared and unlocked',
      'Removed ' + plural_(records, 'violation record') + ' for session ' + sid +
      ' and unlocked it. ' + (queueWhoLabel_(info) ? queueWhoLabel_(info) + ' ' : '') +
      'can now resume the exam.', ui.ButtonSet.OK);
  } else {
    ui.alert('Unlock failed',
      'Violations were cleared but the unlock did not go through. Run Queue Row: Unlock Session.',
      ui.ButtonSet.OK);
  }
  refreshReviewQueue_();
}

/** Queue Row action 3: add extra minutes to a running (watch-row) session. */
function reviewSelectedGrantTime() {
  var ui = SpreadsheetApp.getUi();
  var sid = queueSelectedSessionId_(ui);
  if (!sid) return;
  var info = getSessionInfo_(sid);
  if (!info) {
    return ui.alert('Session not found',
      'No row for session ' + sid + ' in the Sessions sheet. Refresh the queue.', ui.ButtonSet.OK);
  }
  if (info.status !== 'Active') {
    return ui.alert('Not a running exam',
      'Session ' + sid + ' is ' + (info.status || 'not active') +
      '. Only active sessions can be extended.', ui.ButtonSet.OK);
  }
  var minutes = grantMinutesPrompt_(ui);
  if (minutes < 0) return;
  if (!confirmAction_(ui, 'Add time to this exam?',
    'Add ' + plural_(minutes, 'minute') + ' to the running exam for session ' + sid +
    ' (' + queueWhoLabel_(info) + ')? Their timer will extend; locked or submitted sessions are never changed.')) return;
  showGrantResult_(ui, grantTimeToSessions([sid], minutes, 'Review queue: grant time'), minutes);
  refreshReviewQueue_();
}

/** Queue Row presets: apply `minutes` to the selected running row in one
    click, with no minutes prompt and no confirm. Presets are safe to skip
    the confirm: they only add time (never remove or delete anything), they
    are capped by the shared 8 h ceiling, and every grant is audited — the
    plain-language result dialog is the feedback. */
function reviewSelectedGrantPreset_(minutes) {
  var ui = SpreadsheetApp.getUi();
  var sid = queueSelectedSessionId_(ui);
  if (!sid) return;
  var info = getSessionInfo_(sid);
  if (!info) {
    return ui.alert('Session not found',
      'No row for session ' + sid + ' in the Sessions sheet. Refresh the queue.', ui.ButtonSet.OK);
  }
  if (info.status !== 'Active') {
    return ui.alert('Not a running exam',
      'Session ' + sid + ' is ' + (info.status || 'not active') +
      '. Only active sessions can be extended.', ui.ButtonSet.OK);
  }
  showGrantResult_(ui,
    grantTimeToSessions([sid], minutes, 'Review queue: +' + minutes + ' min preset'), minutes);
  refreshReviewQueue_();
}

function reviewSelectedGrantPlus5()  { reviewSelectedGrantPreset_(5); }
function reviewSelectedGrantPlus10() { reviewSelectedGrantPreset_(10); }
function reviewSelectedGrantPlus15() { reviewSelectedGrantPreset_(15); }
function reviewSelectedGrantPlus30() { reviewSelectedGrantPreset_(30); }

// Add admin menu
function onOpen() {
  var counts = { locked: 0, flagged: 0 };
  try {
    ensureSheets();
    refreshReviewQueue_();
    counts = reviewQueueCounts_();
  } catch (e) {
    /* the menu must still appear even if the queue sheet is unavailable */
  }

  var menuLabel = counts.locked > 0
    ? '\uD83D\uDCCB Review Queue (' + counts.locked + ' locked)'
    : counts.flagged > 0
      ? '\uD83D\uDCCB Review Queue (' + counts.flagged + ' flagged)'
      : '\uD83D\uDCCB Review Queue (all clear)';

  var menu = SpreadsheetApp.getUi()
    .createMenu('CRC Admin')
    .addItem(menuLabel, 'showReviewQueue')
    .addSeparator()
    .addItem('Queue Row: Unlock Session', 'reviewSelectedUnlock')
    .addItem('Queue Row: Clear False Positive & Unlock', 'reviewSelectedClearAndUnlock')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Queue Row: Grant Time')
      .addItem('+5 minutes', 'reviewSelectedGrantPlus5')
      .addItem('+10 minutes', 'reviewSelectedGrantPlus10')
      .addItem('+15 minutes', 'reviewSelectedGrantPlus15')
      .addItem('+30 minutes', 'reviewSelectedGrantPlus30')
      .addSeparator()
      .addItem('Custom minutes…', 'reviewSelectedGrantTime'))
    .addSeparator()
    .addItem('🆘 EMERGENCY: Trim Sheet Cells', 'trimSheetDimensions_')
    .addItem('Clear All Violations', 'clearAllViolations')
    .addSeparator()
    .addItem('Clear Violations by Session ID', 'clearViolationsBySessionPrompt')
    .addItem('Bulk: Clear Violations (from selection)', 'bulkClearViolationsFromSelection')
    .addItem('Bulk: Clear Violations (paste IDs)', 'bulkClearViolationsByPastePrompt')
    .addSeparator()
    .addItem('Unlock Session ID', 'unlockSessionPrompt')
    .addItem('Bulk: Unlock Sessions (from selection)', 'bulkUnlockFromSelection')
    .addItem('Bulk: Unlock Sessions (paste IDs)', 'bulkUnlockByPastePrompt')
    .addItem('Bulk: Unlock all Locked (Violations)', 'bulkUnlockAllLockedViolations')
    .addSeparator()
    .addItem('Set Exam Duration', 'setExamDurationPrompt')
    .addSeparator()
    .addItem('Grant Time: +Minutes (Session ID)', 'grantTimeToSessionPrompt')
    .addItem('Grant Time: Bulk +Minutes (from selection)', 'grantTimeFromSelection')
    .addItem('Grant Time: Bulk +Minutes (paste IDs)', 'grantTimeByPastePrompt')
    .addItem('Grant Time: All Active on Exam (form URL)', 'grantTimeByFormPrompt')
    .addSeparator()
    .addItem('Test Email (Authorize MailApp)', 'testSendEmail');
  menu.addToUi();

  /* Land the invigilator on the queue while anyone is locked out, so the
     waiting student is seen the moment the file opens. */
  if (counts.locked > 0) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var q = ss.getSheetByName(REVIEW_SHEET);
      if (q && ss.getActiveSheet() && ss.getActiveSheet().getName() !== REVIEW_SHEET) {
        ss.setActiveSheet(q);
      }
    } catch (e) { /* cosmetic — never block the menu */ }
  }
}

// Test email function
function testSendEmail() {
  try {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: 'CRC Test Email',
      body: 'This is a test to trigger MailApp authorization for CRC violation reports.',
    });
    return 'Test email sent successfully. MailApp is now authorized.';
  } catch (err) {
    return 'Test email failed: ' + String(err && err.message ? err.message : err);
  }
}

// Prompt for session ID to clear
function clearViolationsBySessionPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Clear Violations',
    'Enter Session ID to clear all violations for that session:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    var sessionId = String(response.getResponseText() || '').trim();
    if (!sessionId) return;
    var recordCount = countViolationRows_(sessionId);
    if (!confirmAction_(ui, 'Clear violations?',
      'Clear all violations for session ' + sessionId + '? ' +
        (recordCount > 0
          ? plural_(recordCount, 'violation record') + ' will be permanently deleted and the count reset to 0.'
          : 'This session has no recorded violations. The count will be reset to 0.'))) return;
    var result = clearViolationsForSession(sessionId);
    showClearResult_(ui, result, sessionId);
  }
}

// Prompt for session ID to unlock
function unlockSessionPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Unlock Session',
    'Enter Session ID to unlock:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    var sessionId = String(response.getResponseText() || '').trim();
    if (!sessionId) return;
    var result = unlockSession(sessionId, 'Unlocked by admin');
    if (result && result.ok) {
      ui.alert('Session unlocked',
        'Unlocked session ' + sessionId + '. The student can now resume the exam.',
        ui.ButtonSet.OK);
    } else {
      ui.alert('Could not unlock', 'Nothing was changed. Try again.', ui.ButtonSet.OK);
    }
    try { refreshReviewQueue_(); } catch (e) { /* keep the queue current */ }
  }
}

/* ---- Allow GET requests (for testing) ---- */
function doGet (e) {
  // Log cell count at start of admin operation
  logCellCount_();
  
  ensureSheets();
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';

  if (action === 'unlock_status') {
    var sessionId = p.sessionId || '';
    var unlocked = sessionId ? isSessionUnlocked(sessionId) : false;
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, sessionId: sessionId, unlocked: unlocked })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'session_status') {
    var sid = p.sessionId || '';
    var info = sid ? getSessionInfo_(sid) : null;
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        sessionId: sid,
        found: !!info,
        unlocked: info ? isSessionUnlocked(sid) : false,
        clearedAt: info ? getLastClearedAt_(sid) : '',
        startTime: info ? info.startTime : '',
        violationCount: info ? info.violationCount : 0,
        status: info ? info.status : '',
        reason: info ? info.reason : '',
        durationMs: info ? info.durationMs : 0,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'exam_default') {
    var dFormId = extractFormId_(String(p.formUrl || ''));
    var dDefault = dFormId ? getExamDefault_(dFormId) : null;
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, found: dDefault !== null, durationMs: dDefault || 0 })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'find_session') {
    var fEmail = String(p.email || '').toLowerCase();
    var fFormId = extractFormId_(String(p.formUrl || ''));
    var found = findActiveSession_(fEmail, fFormId);
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, found: !!found, session: found })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: 'CRC Exam Lockdown API is running.' })
  ).setMimeType(ContentService.MimeType.JSON);
}
