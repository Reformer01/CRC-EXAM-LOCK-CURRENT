
/* ---- Sheet names ---- */
var SESSIONS_SHEET   = 'Sessions';
var VIOLATIONS_SHEET = 'Violations';
var UNLOCKS_SHEET    = 'Unlocks';
var RESETS_SHEET     = 'Resets';
var DEBUGLOG_SHEET   = 'DebugLog';

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

  if (!ss.getSheetByName(SESSIONS_SHEET)) {
    var s = ss.insertSheet(SESSIONS_SHEET);
    s.appendRow([
      'Session ID', 'Student Name', 'Student Email', 'Form URL',
      'Start Time', 'End Time', 'Status', 'Violation Count', 'End Reason', 'Duration (ms)'
    ]);
    s.getRange(1, 1, 1, 10).setFontWeight('bold');
    s.setFrozenRows(1);
  } else {
    var sessions = ss.getSheetByName(SESSIONS_SHEET);
    var header = sessions.getRange(1, 1, 1, sessions.getLastColumn()).getValues()[0];
    var desired = [
      'Session ID', 'Student Name', 'Student Email', 'Form URL',
      'Start Time', 'End Time', 'Status', 'Violation Count', 'End Reason', 'Duration (ms)'
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
  var filtered = [data[0]]; // keep header row
  var toDelete = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] !== sessionId) {
      filtered.push(data[i]);
    } else {
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

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  return { ok: true, deleted: Math.max(0, lastRow - 1) };
}

function recomputeViolationCount_(sessionId) {
  if (!sessionId) return 0;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return 0;

  var rows = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === sessionId) count++;
  }

  var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
  var sessionRows = sessionsSheet.getDataRange().getValues();
  for (var j = 1; j < sessionRows.length; j++) {
    if (sessionRows[j][0] === sessionId) {
      sessionsSheet.getRange(j + 1, 7).setValue(count);
      break;
    }
  }

  return count;
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

  switch (action) {

    case 'log_session':
      logSession(data);
      break;

    case 'log_violation':
      logViolation(data);
      break;

    case 'end_session':
      endSession(data);
      break;

    default:
      logDebug_('ERROR', 'doPost_unknown_action', 'Unknown action: ' + action, '', '');
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: 'Unknown action: ' + action })
      ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}

/* ---- LOG SESSION START ---- */
function logSession (data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);

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
  set('Start Time', data.startTime || new Date().toISOString());
  set('End Time', '');
  set('Status', 'Active');
  set('Violation Count', 0);
  set('End Reason', '');
  set('Duration (ms)', data.durationMs || '');

  sheet.appendRow(row);
}

function getViolationsForSession_(sessionId) {
  if (!sessionId) return [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VIOLATIONS_SHEET);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === sessionId) {
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

  var filtered = [data[0]];
  var toDelete = [];
  for (var r = 1; r < data.length; r++) {
    if (!set[data[r][1]]) {
      filtered.push(data[r]);
    } else {
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

function bulkClearViolationsFromSelection() {
  var ui = SpreadsheetApp.getUi();
  var ids = getSelectedSessionIds_();
  if (!ids.length) return ui.alert('No Session IDs found in your selection. Select cells that contain Session IDs (on any tab), or use the paste option.');
  if (!confirmLargeAction_(ui, ids.length, 'Bulk clear violations')) return;
  var result = clearViolationsForSessions(ids, 'Bulk clear (selection)');
  ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
}

function bulkUnlockFromSelection() {
  var ui = SpreadsheetApp.getUi();
  var ids = getSelectedSessionIds_();
  if (!ids.length) return ui.alert('No Session IDs found in your selection. Select cells that contain Session IDs (on any tab), or use the paste option.');
  if (!confirmLargeAction_(ui, ids.length, 'Bulk unlock')) return;
  var result = unlockSessions(ids, 'Bulk unlock (selection)');
  ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
}

function bulkClearViolationsByPastePrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Bulk Clear Violations', 'Paste Session IDs (newline or comma separated):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var ids = parseSessionIds_(response.getResponseText());
  if (!ids.length) return ui.alert('No Session IDs provided.');
  if (!confirmLargeAction_(ui, ids.length, 'Bulk clear violations')) return;
  var result = clearViolationsForSessions(ids, 'Bulk clear (paste)');
  ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
}

function bulkUnlockByPastePrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Bulk Unlock Sessions', 'Paste Session IDs (newline or comma separated):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var ids = parseSessionIds_(response.getResponseText());
  if (!ids.length) return ui.alert('No Session IDs provided.');
  if (!confirmLargeAction_(ui, ids.length, 'Bulk unlock')) return;
  var result = unlockSessions(ids, 'Bulk unlock (paste)');
  ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
}

function bulkUnlockAllLockedViolations() {
  var ui = SpreadsheetApp.getUi();
  var ids = getLockedViolationSessionIds_();
  if (!ids.length) return ui.alert('No sessions are currently marked as Locked (Violations).');
  if (!confirmLargeAction_(ui, ids.length, 'Unlock all Locked (Violations)')) return;
  var result = unlockSessions(ids, 'Bulk unlock: Locked (Violations)');
  ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
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

  /* Also update violation count in Sessions sheet */
  if (data.sessionId) {
    updateSessionViolationCount(data.sessionId);
  }
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

      var reason = data.reason || 'unknown';
      var status = reason === 'submitted' ? 'Submitted' :
                   reason === 'time_expired' ? 'Time Expired' :
                   reason === 'max_violations' ? 'Locked (Violations)' :
                   'Ended';
      sheet.getRange(row, COL_STATUS).setValue(status);
      sheet.getRange(row, COL_END_REASON).setValue(reason);

      var emailResult = { ok: false, error: 'not_attempted' };
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

      // Return email status in response for client-side feedback (if called via GET)
      return { ok: true, emailResult: emailResult };
    }
  }
  logDebug_('ERROR', 'end_session_not_found', 'Session not found for sessionId: ' + data.sessionId, data.sessionId, '');
  return { ok: false, error: 'session_not_found' };
}

/* ---- UPDATE VIOLATION COUNT ---- */
function updateSessionViolationCount (sessionId) {
  withLock_(function () {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SESSIONS_SHEET);
    var rows  = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === sessionId) {
        sheet.getRange(i + 1, 7).setValue((rows[i][6] || 0) + 1);
        return;
      }
    }
  });
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
        return { ok: true, sessionId: sessionId, unlocked: true };
      }
    }

    sheet.appendRow([sessionId, true, now, by, reason || '']);
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

  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
    var sessionRows = sessionsSheet.getDataRange().getValues();

    // 1) Delete all violation rows (except header)
    var purgeResult = purgeAllViolations_();

    // 2) Reset all session violation counts to 0
    for (var j = 1; j < sessionRows.length; j++) {
      sessionsSheet.getRange(j + 1, 7).setValue(0);
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
}

// Add admin menu
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRC Admin')
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
    .addItem('Test Email (Authorize MailApp)', 'testSendEmail')
    .addToUi();
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
    var sessionId = response.getResponseText();
    if (sessionId) {
      var result = clearViolationsForSession(sessionId);
      ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
    }
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
    var sessionId = response.getResponseText();
    if (sessionId) {
      var result = unlockSession(sessionId, 'Unlocked by admin');
      ui.alert('Result', JSON.stringify(result), ui.ButtonSet.OK);
    }
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
    var isUnlocked = sid ? isSessionUnlocked(sid) : false;
    var clearedAt = sid ? getLastClearedAt_(sid) : '';
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, sessionId: sid, unlocked: isUnlocked, clearedAt: clearedAt })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: 'CRC Exam Lockdown API is running.' })
  ).setMimeType(ContentService.MimeType.JSON);
}
