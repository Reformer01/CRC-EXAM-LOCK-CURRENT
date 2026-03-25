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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var violationsSheet = ss.getSheetByName(VIOLATIONS_SHEET);
  var rows = violationsSheet.getDataRange().getValues();
  
  // Find and delete violations for this session
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][1] === sessionId) {
      violationsSheet.deleteRow(i + 1);
    }
  }
  
  // Reset violation count in sessions sheet
  var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
  var sessionRows = sessionsSheet.getDataRange().getValues();
  
  for (var i = 1; i < sessionRows.length; i++) {
    if (sessionRows[i][0] === sessionId) {
      sessionsSheet.getRange(i + 1, 7).setValue(0);
      break;
    }
  }
  
  return { cleared: true, sessionId: sessionId };
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var violationsSheet = ss.getSheetByName(VIOLATIONS_SHEET);
  
  // Keep header row, delete all data rows
  var lastRow = violationsSheet.getLastRow();
  if (lastRow > 1) {
    violationsSheet.deleteRows(2, lastRow - 1);
  }
  
  // Reset all violation counts in sessions sheet
  var sessionsSheet = ss.getSheetByName(SESSIONS_SHEET);
  var sessionRows = sessionsSheet.getDataRange().getValues();
  
  for (var i = 1; i < sessionRows.length; i++) {
    sessionsSheet.getRange(i + 1, 7).setValue(0);
  }
  
  return { cleared: true, message: 'All violations cleared' };
}

// Add admin menu when spreadsheet opens
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CKA Admin')
    .addItem('Clear All Violations', 'clearAllViolations')
    .addSeparator()
    .addItem('Clear Violations by Session ID', 'clearViolationsBySessionPrompt')
    .addSeparator()
    .addItem('Unlock Session ID', 'unlockSessionPrompt')
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
