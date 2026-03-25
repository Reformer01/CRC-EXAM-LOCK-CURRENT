# CKA Exam Lockdown — Chrome Extension

Exam proctoring extension for CKA school. Locks down Google Forms during exams with a fixed 2-hour timer and reports all activity to Google Sheets.

## Features

- **Google Forms only** — activates exclusively on `viewform` and `formResponse` URLs
- **2-hour countdown timer** — persists across page refreshes, auto-locks when time expires
- **Student identification** — name entry required before exam starts
- **Violation detection** — tab switching, copy/paste, right-click, DevTools, fullscreen exit
- **Auto-lockout** — locks after 4 violations or when timer expires
- **Google Sheets reporting** — all sessions and violations logged via webhook
- **Professional popup** — shows live status, timer, and violation count

## Setup

### 1. Deploy the Google Sheets Backend

1. Create a new **Google Spreadsheet** (name it e.g. "CKA Exam Log")
2. Go to **Extensions → Apps Script**
3. Delete any existing code, paste the contents of `GoogleSheetsScript.gs`
4. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and copy the **Web app URL**

### 2. Configure the Extension

Open **`background.js`** and replace:
```js
const WEBHOOK_URL = 'YOUR_GOOGLE_SHEETS_WEBHOOK_URL_HERE';
```
with your actual Web app URL:
```js
const WEBHOOK_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
```

Do the same in **`content.js`** — find `WEBHOOK_URL` in the `CFG` object and set it.

### 3. Load the Extension in Chrome

1. Open **`chrome://extensions/`**
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `CKA-EXAM-LOCK` folder
5. The extension icon should appear in the toolbar

### 4. Test

1. Open any Google Form (viewform URL)
2. The lockdown overlay should appear asking for your name
3. Enter a name and click "Start Exam"
4. Try switching tabs, right-clicking, pressing Ctrl+C — violations should be detected
5. Check your Google Sheet — sessions and violations should be logged

## File Structure

```
CKA-EXAM-LOCK/
├── manifest.json           Manifest V3 config
├── content.js              Main lockdown logic (injected on Google Forms)
├── background.js           Service worker (logging, tab monitoring)
├── overlay.css             Styles for overlays, timer, notifications
├── popup.html              Extension popup interface
├── popup.js                Popup logic
├── popup.css               Popup styles
├── GoogleSheetsScript.gs   Google Apps Script backend (paste into Sheets)
├── icon16.png              Extension icon 16×16
├── icon48.png              Extension icon 48×48
├── icon128.png             Extension icon 128×128
└── README.md               This file
```

## How It Works

1. Student navigates to a Google Form → content script injects automatically
2. Student enters their name and clicks "Start Exam"
3. 2-hour timer starts; page enters fullscreen mode
4. All interactions are monitored — tab switches, clipboard use, developer tools
5. Violations are counted; after 4 violations the exam is locked
6. When the timer expires, the exam is locked
7. When the form is submitted, the exam ends gracefully
8. All events are logged to Google Sheets via the Apps Script webhook
