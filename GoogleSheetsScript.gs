/**
 * EXAM LOCKDOWN - GOOGLE SHEETS INTEGRATION
 * 
 * This Google Apps Script receives violation logs from the Chrome extension
 * and logs them to a Google Sheet. It also allows administrators to clear
 * violations by marking rows in the sheet.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code
 * 4. Deploy as Web App (Deploy > New deployment > Web app)
 * 5. Set "Execute as" to "Me" and "Who has access" to "Anyone"
 * 6. Copy the Web App URL and paste it in config.js as googleSheetsWebhookUrl
 */

// Sheet names
const SHEETS = {
  SESSIONS: 'Exam Sessions',
  VIOLATIONS: 'Violations',
  CLEARED: 'Cleared',
  SUMMARY: 'Summary'
};

// Session statuses
const SESSION_STATUS = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  DISQUALIFIED: 'Disqualified',
  CLEARED: 'Cleared'
};

// Initialize sheets with headers if they don't exist
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Initialize Sessions sheet
  let sheet = ss.getSheetByName(SHEETS.SESSIONS) || ss.insertSheet(SHEETS.SESSIONS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Session ID',
      'Student Name',
      'Student Email',
      'Form URL',
      'Start Time',
      'End Time',
      'Status',
      'Violation Count',
      'Last Violation Time',
      'Duration (mins)',
      'IP Address',
      'User Agent',
      'Cleared',
      'Cleared By',
      'Cleared At',
      'Notes'
    ]);
    formatHeaderRow(sheet);
  }
  
  // Initialize Violations sheet
  sheet = ss.getSheetByName(SHEETS.VIOLATIONS) || ss.insertSheet(SHEETS.VIOLATIONS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp',
      'Session ID',
      'Student Name',
      'Student Email',
      'Form URL',
      'Violation Type',
      'Violation Count',
      'Severity',
      'Status',
      'Details',
      'IP Address',
      'User Agent',
      'Resolved',
      'Resolved By',
      'Resolved At',
      'Notes'
    ]);
    formatHeaderRow(sheet);
  }
  
  // Initialize Summary sheet
  sheet = ss.getSheetByName(SHEETS.SUMMARY) || ss.insertSheet(SHEETS.SUMMARY);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Date',
      'Total Sessions',
      'Completed',
      'Disqualified',
      'Average Duration (mins)',
      'Total Violations',
      'Avg Violations per Session',
      'Most Common Violation',
      'Cleared Sessions',
      'Cleared Violations'
    ]);
    formatHeaderRow(sheet);
  }
}

// Format header row
function formatHeaderRow(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headerRange = sheet.getRange(1, 1, 1, lastColumn);
  
  // Apply formatting
  headerRange.setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('white')
    .setHorizontalAlignment('center');
    
  // Freeze header row
  sheet.setFrozenRows(1);
  
  // Auto-resize columns
  for (let i = 1; i <= lastColumn; i++) {
    sheet.autoResizeColumn(i);
  }
}

/**
 * Main entry point for HTTP GET requests (for testing)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Exam Lockdown Google Sheets Integration is active',
    timestamp: new Date().toISOString(),
    version: '1.0'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Main entry point for HTTP POST requests
 */
function doPost(e) {
  try {
    // Log incoming request for debugging
    Logger.log('Received POST request: ' + e.postData.contents);
    
    // Handle empty or missing postData
    if (!e.postData || !e.postData.contents) {
      return createErrorResponse('No data received');
    }
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    // Initialize sheets on first run
    initializeSheets();
    
    Logger.log('Action: ' + action);
    
    // Handle different actions
    switch (action) {
      case 'startSession':
        return handleStartSession(data.sessionData);
        
      case 'logViolation':
        return logViolation(data.violationData);
      
      case 'endSession':
        return handleEndSession(data.sessionData);
      
      case 'checkClearStatus':
        return checkClearStatus(data.sessionId, data.studentEmail);
      
      case 'getSessionSummary':
        return getSessionSummary(data.sessionId);
        
      default:
        return createErrorResponse('Unknown action: ' + action);
    }
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return createErrorResponse(error.toString(), error.stack);
  }
}

// Handle session start
function handleStartSession(sessionData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.SESSIONS);
    
    // Check if session already exists
    const existingSession = findSession(sessionData.sessionId);
    if (existingSession) {
      return createSuccessResponse({
        sessionId: sessionData.sessionId,
        status: 'session_exists',
        message: 'Session already exists',
        existingSession: existingSession
      });
    }
    
    // Add new session
    const now = new Date();
    sheet.appendRow([
      sessionData.sessionId,
      sessionData.studentName || '',
      sessionData.studentEmail || '',
      sessionData.formUrl || '',
      now.toISOString(), // Start Time
      '', // End Time
      SESSION_STATUS.ACTIVE, // Status
      0, // Violation Count
      '', // Last Violation Time
      '', // Duration
      sessionData.ipAddress || '',
      sessionData.userAgent || '',
      'NO', // Cleared
      '', // Cleared By
      '', // Cleared At
      sessionData.notes || ''
    ]);
    
    return createSuccessResponse({
      sessionId: sessionData.sessionId,
      status: 'started',
      timestamp: now.toISOString()
    });
    
  } catch (error) {
    return createErrorResponse('Failed to start session: ' + error.toString());
  }
}

// Handle session end
function handleEndSession(sessionData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.SESSIONS);
    const data = sheet.getDataRange().getValues();
    
    // Find session
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sessionData.sessionId) {
        const now = new Date();
        const startTime = new Date(data[i][4]);
        const duration = Math.round((now - startTime) / 60000); // in minutes
        
        // Update session
        sheet.getRange(i + 1, 6).setValue(now.toISOString()); // End Time
        sheet.getRange(i + 1, 7).setValue(
          sessionData.status === 'disqualified' ? 
          SESSION_STATUS.DISQUALIFIED : SESSION_STATUS.COMPLETED
        );
        sheet.getRange(i + 1, 10).setValue(duration);
        
        // Update summary
        updateSummaryStats();
        
        return createSuccessResponse({
          sessionId: sessionData.sessionId,
          status: 'ended',
          timestamp: now.toISOString(),
          duration: duration
        });
      }
    }
    
    return createErrorResponse('Session not found');
    
  } catch (error) {
    return createErrorResponse('Failed to end session: ' + error.toString());
  }
}

// Find session by ID
function findSession(sessionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SESSIONS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      return {
        sessionId: data[i][0],
        studentName: data[i][1],
        studentEmail: data[i][2],
        formUrl: data[i][3],
        startTime: data[i][4],
        status: data[i][6],
        violationCount: data[i][7] || 0,
        lastViolationTime: data[i][8],
        cleared: data[i][12] === 'YES'
      };
    }
  }
  return null;
}

// Update summary statistics
function updateSummaryStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
  const violationsSheet = ss.getSheetByName(SHEETS.VIOLATIONS);
  const summarySheet = ss.getSheetByName(SHEETS.SUMMARY);
  
  // Get today's date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Get all sessions
  const sessionsData = sessionsSheet.getDataRange().getValues();
  const violationsData = violationsSheet.getDataRange().getValues();
  
  // Filter today's sessions
  const todaySessions = sessionsData.filter((row, index) => {
    if (index === 0) return false; // Skip header
    const date = new Date(row[4]); // Start Time
    return date.toISOString().startsWith(todayStr);
  });
  
  // Calculate stats
  const stats = {
    date: todayStr,
    totalSessions: todaySessions.length,
    completed: todaySessions.filter(s => s[6] === SESSION_STATUS.COMPLETED).length,
    disqualified: todaySessions.filter(s => s[6] === SESSION_STATUS.DISQUALIFIED).length,
    cleared: todaySessions.filter(s => s[12] === 'YES').length,
    totalViolations: 0,
    avgDuration: 0,
    mostCommonViolation: 'None',
    clearedViolations: 0
  };
  
  // Calculate average duration (in minutes)
  const durations = todaySessions
    .map(s => s[9] || 0) // Duration in minutes
    .filter(d => d > 0);
    
  stats.avgDuration = durations.length > 0 ? 
    Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  
  // Count violations
  if (violationsData.length > 1) { // Skip header
    const violationTypes = {};
    let maxCount = 0;
    
    for (let i = 1; i < violationsData.length; i++) {
      const violationDate = new Date(violationsData[i][0]);
      if (violationDate.toISOString().startsWith(todayStr)) {
        stats.totalViolations++;
        
        // Count violation types
        const type = violationsData[i][5]; // Violation Type
        violationTypes[type] = (violationTypes[type] || 0) + 1;
        
        // Track most common violation
        if (violationTypes[type] > maxCount) {
          maxCount = violationTypes[type];
          stats.mostCommonViolation = type;
        }
        
        // Count cleared violations
        if (violationsData[i][12] === 'YES') {
          stats.clearedViolations++;
        }
      }
    }
  }
  
  // Add or update today's summary
  const summaryData = summarySheet.getDataRange().getValues();
  let rowIndex = -1;
  
  for (let i = 1; i < summaryData.length; i++) {
    if (summaryData[i][0] === todayStr) {
      rowIndex = i + 1;
      break;
    }
  }
  
  const rowData = [
    stats.date,
    stats.totalSessions,
    stats.completed,
    stats.disqualified,
    stats.avgDuration,
    stats.totalViolations,
    stats.totalSessions > 0 ? (stats.totalViolations / stats.totalSessions).toFixed(2) : 0,
    stats.mostCommonViolation,
    stats.cleared,
    stats.clearedViolations
  ];
  
  if (rowIndex > 0) {
    // Update existing row
    summarySheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Add new row
    summarySheet.appendRow(rowData);
  }
  
  // Format summary sheet
  formatHeaderRow(summarySheet);
  
  return stats;
}

/**
 * Log a violation to the Violations sheet
 */
function logViolation(violationData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.VIOLATIONS);
    const now = new Date();
    
    // Determine severity based on violation type
    let severity = 'medium';
    if (violationData.type === 'TIME_EXCEEDED') {
      severity = 'high';
    }
    
    // Add violation data
    sheet.appendRow([
      now.toISOString(), // Timestamp
      violationData.sessionId || '',
      violationData.studentName || '',
      violationData.studentEmail || '',
      violationData.formUrl || '',
      violationData.type || 'unknown',
      violationData.violationCount || 0,
      severity, // low, medium, high, critical
      violationData.status || 'new',
      JSON.stringify(violationData.metadata || {}),
      violationData.ipAddress || '',
      violationData.userAgent || '',
      'NO', // Resolved
      '', // Resolved By
      '', // Resolved At
      violationData.notes || ''
    ]);
    
    // Auto-resize columns
    sheet.autoResizeColumns(1, sheet.getLastColumn());
    
    // Apply conditional formatting based on severity
    const lastRow = sheet.getLastRow();
    const severityCell = sheet.getRange(lastRow, 8);
    
    switch (severity) {
      case 'low':
        severityCell.setBackground('#e8f5e9'); // Light green
        break;
      case 'medium':
        severityCell.setBackground('#fff8e1'); // Light yellow
        break;
      case 'high':
        severityCell.setBackground('#fff3e0'); // Light orange
        break;
      case 'critical':
        severityCell.setBackground('#ffebee'); // Light red
        break;
      default:
        severityCell.setBackground('#f5f5f5'); // Light gray
    }
    
    // Update session's violation count and last violation time
    updateSessionViolationCount(
      violationData.sessionId, 
      violationData.violationCount,
      now.toISOString()
    );
    
    // Special handling for TIME_EXCEEDED violations
    if (violationData.type === 'TIME_EXCEEDED') {
      updateSessionStatus(violationData.sessionId, SESSION_STATUS.LOCKED);
      // Send notification to admin if configured
      sendTimeExceededNotification(violationData);
    }
    
    // Update summary stats
    updateSummaryStats();
    
    return createSuccessResponse({
      success: true,
      message: 'Violation logged successfully',
      row: lastRow,
      timestamp: now.toISOString()
    });
    
  } catch (error) {
    Logger.log('Error in logViolation: ' + error.toString());
    return createErrorResponse('Failed to log violation: ' + error.toString());
  }
}

// Update session's violation count and last violation time
function updateSessionViolationCount(sessionId, violationCount, timestamp) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.SESSIONS);
    const data = sheet.getDataRange().getValues();
    
    // Find session
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sessionId) {
        // Update violation count and last violation time
        sheet.getRange(i + 1, 8).setValue(violationCount); // Violation Count
        if (timestamp) {
          sheet.getRange(i + 1, 9).setValue(timestamp); // Last Violation Time
        }
        
        // Update status if disqualified
        if (violationCount >= 3) { // Assuming 3 violations = disqualified
          sheet.getRange(i + 1, 7).setValue(SESSION_STATUS.DISQUALIFIED);
        }
        
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log('Error updating session violation count: ' + error.toString());
    return false;
  }
}

/**
 * Check if violations have been cleared for a student
 */
function checkClearStatus(sessionId, studentEmail) {
  try {
    // First check sessions
    const session = findSession(sessionId);
    if (session && session.cleared) {
      return createSuccessResponse({
        cleared: true,
        clearedAt: session.clearedAt || new Date().toISOString(),
        clearedBy: session.clearedBy || 'Administrator',
        sessionId: sessionId
      });
    }
    
    // Then check individual violations
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.VIOLATIONS);
    const data = sheet.getDataRange().getValues();
    
    // Check if any row for this session/email has been marked as resolved
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowSessionId = row[1]; // Session ID column
      const rowEmail = row[3]; // Student Email column
      const resolvedStatus = row[12]; // Resolved column
      
      // Match by session ID or email
      if ((sessionId && rowSessionId === sessionId) || (studentEmail && rowEmail === studentEmail)) {
        if (resolvedStatus === 'YES' || resolvedStatus === 'yes' || resolvedStatus === true) {
          // Mark as processed by changing to 'PROCESSED'
          sheet.getRange(i + 1, 13).setValue('PROCESSED');
          
          // If this is a session-wide clearance, update the session
          if (session) {
            const sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
            const sessionRow = getSessionRow(sessionId);
            if (sessionRow > 0) {
              sessionsSheet.getRange(sessionRow, 13).setValue('YES'); // Cleared
              sessionsSheet.getRange(sessionRow, 14).setValue(row[13] || 'Administrator'); // Cleared By
              sessionsSheet.getRange(sessionRow, 15).setValue(row[14] || new Date().toISOString()); // Cleared At
            }
          }
          
          return createSuccessResponse({
            cleared: true,
            clearedBy: row[13] || 'Administrator',
            clearedAt: row[14] || new Date().toISOString(),
            sessionId: sessionId,
            violationId: row[0] // Timestamp as ID
          });
        }
      }
    }
    
    return createSuccessResponse({
      cleared: false,
      message: 'No clearance found',
      sessionId: sessionId
    });
    
  } catch (error) {
    Logger.log('Error in checkClearStatus: ' + error.toString());
    return createErrorResponse('Failed to check clear status: ' + error.toString());
  }
}

// Get session row number by session ID
function getSessionRow(sessionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SESSIONS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      return i + 1; // +1 because array is 0-based but rows are 1-based
    }
  }
  
  return -1;
}

// Get session summary
function getSessionSummary(sessionId) {
  try {
    const session = findSession(sessionId);
    if (!session) {
      return createErrorResponse('Session not found');
    }
    
    // Get all violations for this session
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.VIOLATIONS);
    const data = sheet.getDataRange().getValues();
    
    const violations = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === sessionId) {
        violations.push({
          timestamp: data[i][0],
          violationType: data[i][5],
          severity: data[i][7],
          status: data[i][8],
          details: data[i][9],
          resolved: data[i][12] === 'YES',
          resolvedBy: data[i][13],
          resolvedAt: data[i][14]
        });
      }
    }
    
    // Calculate some stats
    const stats = {
      totalViolations: violations.length,
      activeViolations: violations.filter(v => !v.resolved).length,
      violationTypes: {},
      severityCounts: { low: 0, medium: 0, high: 0, critical: 0 }
    };
    
    violations.forEach(v => {
      // Count by type
      stats.violationTypes[v.violationType] = (stats.violationTypes[v.violationType] || 0) + 1;
      
      // Count by severity
      if (v.severity && stats.severityCounts.hasOwnProperty(v.severity)) {
        stats.severityCounts[v.severity]++;
      }
    });
    
    return createSuccessResponse({
      session: session,
      violations: violations,
      stats: stats
    });
    
  } catch (error) {
    return createErrorResponse('Failed to get session summary: ' + error.toString());
  }
}

/**
 * Create a menu for manual operations
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Exam Lockdown')
    .addItem('Clear Selected Student', 'clearSelectedStudent')
    .addItem('Export Report', 'exportReport')
    .addSeparator()
    .addItem('Open Admin Panel', 'showAdminPanel')
    .addItem('Update Summary', 'updateSummaryStats')
    .addSeparator()
    .addItem('Initialize Sheets', 'initializeSheets')
    .addToUi();
  
  // Initialize sheets if this is a new spreadsheet
  try {
    initializeSheets();
  } catch (e) {
    Logger.log('Initialization error: ' + e.toString());
  }
}

/**
 * Show an admin panel as a sidebar in the Google Sheet.
 * The sidebar will call server-side functions to list sessions and clear violations.
 */
function showAdminPanel() {
  const html = HtmlService.createHtmlOutputFromFile('AdminUI')
    .setTitle('Exam Lockdown - Admin');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Return all sessions as an array of objects for the admin UI.
 */
function getAllSessions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const sessions = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    sessions.push({
      sessionId: row[0],
      studentName: row[1],
      studentEmail: row[2],
      formUrl: row[3],
      startTime: row[4],
      endTime: row[5],
      status: row[6],
      violationCount: row[7],
      lastViolationTime: row[8],
      cleared: row[12] === 'YES' || row[12] === true,
      clearedBy: row[13] || '',
      clearedAt: row[14] || ''
    });
  }
  return sessions;
}

/**
 * Clear violations for a student or session identifier.
 * Marks the Violations sheet 'Resolved' column and updates the Sessions sheet.
 */
function clearViolations(identifier, clearedBy = 'Admin') {
  // Delegates to internal helper and returns a ContentService response
  const result = _clearViolationsInternal(identifier, clearedBy);
  return createSuccessResponse({ clearedCount: result.clearedCount, timestamp: result.timestamp });
}

/**
 * Internal helper that performs the sheet updates and returns an object
 * { clearedCount, timestamp }
 */
function _clearViolationsInternal(identifier, clearedBy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date().toISOString();
  let clearedCount = 0;

  const violationsSheet = ss.getSheetByName(SHEETS.VIOLATIONS);
  if (violationsSheet) {
    const data = violationsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const violationSessionId = row[1]; // Column B
      const studentEmail = row[3]; // Column D

      if (violationSessionId === identifier || studentEmail === identifier) {
        // Column 13 (M) is 'Resolved'
        violationsSheet.getRange(i + 1, 13).setValue('YES');
        violationsSheet.getRange(i + 1, 14).setValue(clearedBy);
        violationsSheet.getRange(i + 1, 15).setValue(now);
        clearedCount++;
      }
    }
  }

  // Update session row if present
  const sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (sessionsSheet) {
    const sessionsData = sessionsSheet.getDataRange().getValues();
    for (let i = 1; i < sessionsData.length; i++) {
      const row = sessionsData[i];
      const sessionId = row[0]; // Column A
      const studentEmail = row[3]; // Column D

      if (sessionId === identifier || studentEmail === identifier) {
        sessionsSheet.getRange(i + 1, 13).setValue('YES');
        sessionsSheet.getRange(i + 1, 14).setValue(clearedBy);
        sessionsSheet.getRange(i + 1, 15).setValue(now);
        break;
      }
    }
  }

  return { clearedCount, timestamp: now };
}

/**
 * Menu action: Clear the selected student(s) from the active sheet selection.
 * It prompts for confirmation and an optional "cleared by" name.
 */
function clearSelectedStudent() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();

  if (!range) {
    ui.alert('No selection', 'Please select one or more rows in the Sessions sheet, then try again.', ui.ButtonSet.OK);
    return;
  }

  const startRow = range.getRow();
  const numRows = range.getNumRows();

  // Confirm action
  const confirm = ui.alert('Confirm Clear', `Clear violations for ${numRows} selected row(s)?`, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // Prompt for clearedBy
  const prompt = ui.prompt('Cleared By', 'Enter a name to record who cleared these violations (leave blank for "Admin"):', ui.ButtonSet.OK_CANCEL);
  if (prompt.getSelectedButton() === ui.Button.CANCEL) return;
  const clearedBy = (prompt.getResponseText() || 'Admin').trim() || 'Admin';

  let totalCleared = 0;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (!sessionsSheet) {
    ui.alert('Sessions sheet not found');
    return;
  }

  const sessionsData = sessionsSheet.getDataRange().getValues();

  for (let r = startRow; r < startRow + numRows; r++) {
    const rowIndex = r - 1; // zero-based
    if (rowIndex <= 0 || rowIndex >= sessionsData.length) continue; // skip header and out-of-range
    const row = sessionsData[rowIndex];
    const sessionId = row[0];
    const studentEmail = row[3];

    const identifier = sessionId || studentEmail;
    if (!identifier) continue;

    const result = _clearViolationsInternal(identifier, clearedBy);
    totalCleared += result.clearedCount || 0;
  }

  ui.alert('Clear Completed', `Marked ${totalCleared} violation row(s) as cleared.`, ui.ButtonSet.OK);
}

/**
 * Export violations report
 */
function exportReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.VIOLATIONS);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No violations to export');
    return;
  }

  // Create or reset the summary sheet
  let summarySheet = ss.getSheetByName('Summary');
  if (!summarySheet) {
    summarySheet = ss.insertSheet('Summary');
  } else {
    summarySheet.clear();
  }

  // Add summary headers
  summarySheet.appendRow(['Student Email', 'Student Name', 'Total Violations', 'Status', 'Last Violation']);

  const data = sheet.getDataRange().getValues();
  const studentMap = {};

  // Aggregate violations by student
  for (let i = 1; i < data.length; i++) {
    const email = data[i][3] || 'unknown';
    const name = data[i][2] || '';
    const count = Number(data[i][6]) || 0;
    const status = data[i][7] || '';
    const timestamp = data[i][0] || '';

    if (!studentMap[email]) {
      studentMap[email] = {
        name: name,
        totalViolations: 0,
        status: status,
        lastViolation: timestamp
      };
    }

    studentMap[email].totalViolations = Math.max(studentMap[email].totalViolations, count);
    studentMap[email].status = status;
    studentMap[email].lastViolation = timestamp;
  }

  // Write summary rows
  for (const email in studentMap) {
    const student = studentMap[email];
    summarySheet.appendRow([
      email,
      student.name,
      student.totalViolations,
      student.status,
      student.lastViolation
    ]);
  }

  summarySheet.autoResizeColumns(1, 5);

  SpreadsheetApp.getUi().alert('Report generated in "Summary" sheet');
}


function createSuccessResponse(data) {
  // Create a new object with success: true and copy all properties from data
  var response = { success: true };
  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      response[key] = data[key];
    }
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(error, details = '') {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: error,
    details: details
  })).setMimeType(ContentService.MimeType.JSON);
}

// Update session status
function updateSessionStatus(sessionId, status) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.SESSIONS);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sessionId) {
        sheet.getRange(i + 1, 7).setValue(status); // Status column
        return true;
      }
    }
    return false;
  } catch (error) {
    Logger.log('Error updating session status: ' + error.toString());
    return false;
  }
}

// Send notification for time exceeded
function sendTimeExceededNotification(violationData) {
  try {
    // Optional: Send email notification to admin
    const adminEmail = 'reformer.ejembi@iworldnetworks.net'; // Replace with actual admin email
    
    const subject = 'Exam Time Limit Exceeded';
    const body = `
Student: ${violationData.studentName || 'Unknown'}
Email: ${violationData.studentEmail || 'Unknown'}
Session ID: ${violationData.sessionId || 'Unknown'}
Time: ${new Date().toLocaleString()}

The exam session has been automatically locked due to time limit expiration.
    `;
    
    // Uncomment to enable email notifications
    // MailApp.sendEmail(adminEmail, subject, body);
    
    Logger.log('Time exceeded notification for session: ' + violationData.sessionId);
  } catch (e) {
    Logger.log('Failed to send time exceeded notification: ' + e.toString());
  }
}
