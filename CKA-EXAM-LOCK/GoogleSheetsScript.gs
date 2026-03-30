/**
 * ============================================================
 * CKA Exam Lockdown — Google Apps Script Backend
 * ============================================================
 *
 * SETUP:
 * 1. Open Google Sheets → Extensions → Apps Script
 * 2. Paste this entire file into Code.gs
 * 3. Click Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL
 * 5. Paste it into background.js as WEBHOOK_URL
 *    and into content.js as CFG.WEBHOOK_URL
 */

/* ---- Sheet names ---- */
var SESSIONS_SHEET   = 'Sessions';
var VIOLATIONS_SHEET = 'Violations';
var UNLOCKS_SHEET    = 'Unlocks';
var RESETS_SHEET     = 'Resets';
var DEBUGLOG_SHEET   = 'DebugLog';

/* ---- Ensure sheets exist with headers ---- */
function ensureSheets () {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(SESSIONS_SHEET)) {
    var s = ss.insertSheet(SESSIONS_SHEET);
    s.appendRow([
      'Session ID', 'Student Name', 'Form URL',
      'Start Time', 'End Time', 'Status', 'Violation Count', 'End Reason'
    ]);
    s.getRange(1, 1, 1, 8).setFontWeight('bold');
    s.setFrozenRows(1);
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
      'Timestamp', 'Level', 'Event', 'Details'
    ]);
    d.getRange(1, 1, 1, 4).setFontWeight('bold');
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

function logDebug_(level, event, details) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DEBUGLOG_SHEET);
  if (!sheet) return;
  sheet.appendRow([
    new Date().toISOString(),
    level || 'INFO',
    event || '',
    details || ''
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
  ensureSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var range;
  try { range = ss.getActiveRange(); } catch (e) { range = null; }
  if (!range) return [];

  var activeSheet = range.getSheet();
  var values = range.getValues();

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
  for (var r = 1; r < data.length; r++) {
    if (!set[data[r][1]]) filtered.push(data[r]);
  }

  sheet.clearContents();
  sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
  return { ok: true, deleted: data.length - filtered.length };
}

function setClearMarkersBatch_(sessionIds, reason) {
  ensureSheets();
  if (!sessionIds || sessionIds.length === 0) return { ok: true, updated: 0, appended: 0, now: '' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RESETS_SHEET);
  if (!sheet) return { ok: false, error: 'Resets sheet missing' };

  var rows = sheet.getDataRange().getValues();
  var index = {};
  for (var i = 1; i < rows.length; i++) {
    var sid = rows[i][0];
    if (sid) index[String(sid).trim()] = i + 1;
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
  ensureSheets();
  sessionIds = sessionIds || [];
  if (sessionIds.length === 0) return { ok: false, error: 'no_sessionIds' };

  return withLock_(function () {
    var actor = getActorEmail_();
    var markerRes = setClearMarkersBatch_(sessionIds, reason || 'Bulk clear violations');
    var purgeRes = purgeViolationsForSessions_(sessionIds);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
    var sessionRows = sessionsSheet.getDataRange().getValues();
    var header = sessionRows[0] || [];
    var sidIdx = header.indexOf('Session ID');
    var vcIdx = header.indexOf('Violation Count');
    if (sidIdx === -1) sidIdx = 0;
    if (vcIdx === -1) vcIdx = 6;

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
    }));

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
    }));

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

/* ---- Web App entry point ---- */
function doPost (e) {
  ensureSheets();

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Invalid JSON' })
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

  sheet.appendRow([
    data.sessionId   || '',
    data.studentName || '',
    data.formUrl     || '',
    data.startTime   || new Date().toISOString(),
    '',              // end time (filled later)
    'Active',        // status
    0,               // violation count
    ''               // end reason
  ]);
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
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  var rows  = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.sessionId) {
      var row = i + 1;  // 1-indexed
      sheet.getRange(row, 5).setValue(data.endTime || new Date().toISOString());

      var reason = data.reason || 'unknown';
      var status = reason === 'submitted' ? 'Submitted' :
                   reason === 'time_expired' ? 'Time Expired' :
                   reason === 'max_violations' ? 'Locked (Violations)' :
                   'Ended';
      sheet.getRange(row, 6).setValue(status);
      sheet.getRange(row, 8).setValue(reason);
      break;
    }
  }
}

/* ---- UPDATE VIOLATION COUNT ---- */
function updateSessionViolationCount (sessionId) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  var rows  = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === sessionId) {
      var current = parseInt(rows[i][6], 10) || 0;
      sheet.getRange(i + 1, 7).setValue(current + 1);
      break;
    }
  }
}

/* ---- ADMIN FUNCTIONS ---- */

// Clear all violations for a specific session
function clearViolationsForSession(sessionId) {
  return clearViolationsForSessions([String(sessionId || '').trim()], 'Clear violations');
}

function unlockSession(sessionId, reason) {
  ensureSheets();
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
}

function isSessionUnlocked(sessionId) {
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
  ensureSheets();
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var violationsSheet = ss.getSheetByName(VIOLATIONS_SHEET);
    var lastRow = violationsSheet.getLastRow();
    if (lastRow > 1) violationsSheet.deleteRows(2, lastRow - 1);

    var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
    var sessionRows = sessionsSheet.getDataRange().getValues();
    for (var i = 1; i < sessionRows.length; i++) {
      sessionsSheet.getRange(i + 1, 7).setValue(0);
    }

    logDebug_('INFO', 'admin_action', JSON.stringify({ action: 'clear_all_violations', deleted: Math.max(0, lastRow - 1), actor: getActorEmail_() }));
    return { ok: true, cleared: true, message: 'All violations cleared', deleted: Math.max(0, lastRow - 1) };
  });
}

// Add admin menu when spreadsheet opens
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CKA Admin')
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
    .addToUi();
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

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: 'CKA Exam Lockdown API is running.' })
  ).setMimeType(ContentService.MimeType.JSON);
}
