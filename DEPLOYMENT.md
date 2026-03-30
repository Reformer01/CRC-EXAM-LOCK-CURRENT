# CRC Exam Lockdown Chrome Extension – Deployment Guide

## Overview
The CRC Exam Lockdown Chrome Extension proctors Google Forms exams by monitoring student activity, logging violations, and reporting results to a Google Sheets backend. It supports configurable exam duration, violation cooldowns, and automatic email reports to students.

## Features
- **Real-time monitoring**: Detects tab switches, window focus loss, devtools, and keyboard shortcuts.
- **Violation tracking**: Configurable max violations with global cooldown (1.5s default).
- **Student identification**: Requires student name and email at exam start.
- **Configurable duration**: Student selects exam duration (30–120 minutes).
- **Email reports**: Sends violation summaries to students at exam end (only if violations occurred).
- **Backend logging**: Google Sheets backend stores sessions, violations, unlocks, and resets.
- **Cross-browser**: Uses `browser`/`chrome` API fallback for broader compatibility.
- **Admin controls**: Clear violations, unlock sessions, and manage via spreadsheet menu.

## Architecture
- **Extension (Manifest V3)**:
  - `content.js`: Content script injected into Google Forms pages.
  - `background.js`: Service worker handling messaging and webhook calls.
  - `popup.js/ui`: Extension popup for quick status checks.
  - `overlay.css`: In-exam UI overlay styling.
- **Backend**: Google Apps Script (`GoogleSheetsScript.gs`) deployed as a web app.
  - Receives webhook payloads from the extension.
  - Manages Sheets: `Sessions`, `Violations`, `Unlocks`, `Resets`, `DebugLog`.
  - Sends violation report emails via `MailApp`.

## Prerequisites
- Google Chrome (or Chromium-based browser).
- Google Account to host the Apps Script web app.
- Google Sheet for backend data.
- OAuth consent for Apps Script (scopes: `script.send_mail`, etc.).

## Deployment Steps

### 1. Prepare Google Sheets Backend
1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**.
3. Paste the contents of `GoogleSheetsScript.gs`.
4. Save and **Deploy** > **New deployment**:
   - Type: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone** (or your domain).
   - Copy the **Web app URL** (this is the webhook URL).

5. Run `testSendEmail` from the Apps Script editor to authorize MailApp:
   - In the editor, select `testSendEmail` and click **Run**.
   - Accept the authorization prompt.
   - Redeploy the web app to ensure the scope is active.

6. Open the linked Sheet; refresh to see the **CRC Admin** menu.

### 2. Configure Extension
1. Open `CRC-EXAM-LOCK/manifest.json`.
2. Set the `WEBHOOK_URL` in `background.js` to your Apps Script web app URL:
   ```js
   const WEBHOOK_URL = 'https://script.google.com/macros/s/.../exec';
   ```
3. (Optional) Adjust constants in `content.js`:
   - `MAX_VIOLATIONS`: Default 4.
   - `COOLDOWN_MS`: Global 1500ms.
   - `SCHOOL_NAME`: Your institution name.

### 3. Load Extension in Chrome (Development)
1. Open **chrome://extensions**.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `CRC-EXAM-LOCK` folder.
4. Verify the extension icon appears.

### 4. Production Deployment (Chrome Web Store)
1. Package the extension:
   - In `chrome://extensions`, click **Pack extension**.
   - Select `CRC-EXAM-LOCK` as the root directory.
   - This generates a `.crx` and private key.
2. Upload to the Chrome Web Store:
   - Visit the [Chrome Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard).
   - Create a new item, upload the `.crx`, and fill in:
     - **Name**: CRC Exam Lockdown
     - **Description**: Proctors Google Forms exams with violation tracking and email reports.
     - **Category**: Education
     - **Permissions**: Review `manifest.json` (storage, tabs, scripting, etc.).
   - Submit for review.

## Configuration Details

### Webhook URL
- Set in `background.js`:
  ```js
  const WEBHOOK_URL = 'https://script.google.com/macros/s/.../exec';
  ```
- Ensure the web app is deployed with **Anyone** access.

### Exam Durations
- Edit `CFG.DURATION_OPTIONS_MS` in `content.js` (default: [30, 45, 60, 90, 120] minutes).

### Violation Types
- Monitored violations (see `attachMonitors` in `content.js`):
  - `visibility_change`: Tab hidden/switched.
  - `window_blur`: Window lost focus.
  - `devtools`: DevTools opened.
  - `copy_paste`: Ctrl+C/V/A.
  - `f12`: F12 key.

### Email Reports
- Triggered at exam end if violations exist.
- Sent to the student’s email provided at start.
- Uses `MailApp.sendEmail` (requires authorization).

### Admin Menu (Spreadsheet)
- **CRC Admin** menu:
  - Clear All Violations
  - Clear Violations by Session ID
  - Unlock Session ID
  - Test Email (Authorize MailApp)

## Troubleshooting
- **No email received**:
  - Run `testSendEmail` to authorize MailApp.
  - Check `DebugLog` sheet for errors.
  - Ensure `studentEmail` is provided at exam start.
- **Extension not loading**:
  - Verify Manifest V3 syntax.
  - Check `chrome://extensions` for errors.
- **Webhook failures**:
  - Confirm the web app URL is correct and deployed.
  - Check Apps Script `Executions` logs.
- **Missing violations in sheet**:
  - Ensure `END_SESSION` includes `studentEmail`.
  - Verify `DebugLog` for parsing errors.

## Host Permissions Justification
The extension uses minimal, required host permissions:
- `https://script.google.com/*` and `https://script.googleusercontent.com/*`: Required to call the Apps Script webhook for logging sessions, violations, and sending email reports.
- Content script injection is limited to Google Forms via `content_scripts` matches (`https://docs.google.com/forms/*`), so no broad host permissions are needed.
- **Why**: To limit network access to only the backend service and respect privacy.

## Permissions Justification
The extension requests only the permissions it uses in `manifest.json`:
- **storage**: Saves exam session state locally (student name/email, start time, violations) so the session survives page reloads or accidental closes.
- **tabs**: Sends messages to the content script of the active tab and detects tab switches (a violation).
- **scripting**: Injects the content script into Google Forms pages to display the overlay and attach monitors.
- **activeTab**: Ensures the content script is attached to the currently active Google Form.
- **No background permission**: Uses a service worker declared in `background`, which does not require a separate permission.

No data is sent to third parties; all data is stored locally or in your Google Sheet backend.
- Student data is stored in the Google Sheet.
- Email reports contain only violations and timestamps.
- No data is sent to third-party services.

## Version History
- v1.0: Basic violation monitoring.
- v1.1: Added email reports and duration selection.
- v1.2: Defensive checks, DebugLog, MailApp authorization helper.

## Support
- Check the `DebugLog` sheet for detailed error logs.
- Review Apps Script Executions and Chrome extension logs.
- Ensure the web app is redeployed after any code changes.
