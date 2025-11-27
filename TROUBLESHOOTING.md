# Google Sheets Integration Troubleshooting

## Issue: Violations Not Appearing in Google Sheet

### Quick Diagnosis Steps

1. **Open Browser Console** (F12)
   - Go to the exam form
   - Trigger a violation (exit fullscreen)
   - Look for messages starting with `[ServiceWorker]`
   - Check for any red error messages

2. **Check Extension Background Console**
   - Go to `chrome://extensions/`
   - Find "Exam Lockdown" extension
   - Click "service worker" link
   - Look for logs about Google Sheets

3. **Test the Webhook Directly**
   - Open `test_google_sheets.html` in your browser
   - Paste your webhook URL
   - Click "Test Log Violation"
   - This will tell you if the Apps Script is working

### Common Issues & Fixes

#### 1. Webhook URL Not Configured
**Symptom:** No errors, but nothing happens
**Fix:**
- Open `config.js`
- Make sure `googleSheetsWebhookUrl` has your Web App URL
- Reload the extension

#### 2. Apps Script Not Deployed
**Symptom:** Network error or 404
**Fix:**
1. Go to Apps Script editor
2. Click **Deploy** > **Manage deployments**
3. If no deployments exist, create one:
   - **Deploy** > **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the new Web App URL

#### 3. Wrong Permissions
**Symptom:** "Authorization required" or permission errors
**Fix:**
1. In Apps Script, click **Deploy** > **Test deployments**
2. Click the URL to test
3. Sign in and grant permissions
4. After granting permissions, redeploy:
   - **Deploy** > **Manage deployments**
   - Click edit icon (✏️)
   - Change version to "New version"
   - Click **Deploy**

#### 4. CORS Issues
**Symptom:** "CORS policy" error in console
**Fix:**
- This shouldn't happen with Apps Script Web Apps
- If it does, make sure you're using the `/exec` URL, not `/dev`
- Correct: `https://script.google.com/macros/s/.../exec`
- Wrong: `https://script.google.com/macros/s/.../dev`

#### 5. Extension Not Loaded
**Symptom:** No violations detected at all
**Fix:**
1. Go to `chrome://extensions/`
2. Make sure "Exam Lockdown" is enabled
3. Click the reload icon (🔄)
4. Refresh the exam page

#### 6. Config Not Loading
**Symptom:** Console shows "googleSheetsWebhookUrl is undefined"
**Fix:**
1. Check `config.js` syntax - make sure there are no typos
2. Reload the extension
3. Hard refresh the exam page (Ctrl+Shift+R)

### Verification Checklist

- [ ] Google Sheet created
- [ ] Apps Script code pasted
- [ ] Apps Script deployed as Web App
- [ ] Web App URL copied
- [ ] URL pasted in `config.js` (with quotes)
- [ ] Extension reloaded
- [ ] Exam page refreshed
- [ ] Test violation triggered
- [ ] Browser console checked for errors

### Testing Workflow

1. **Test the Apps Script Directly**
   ```
   Open: test_google_sheets.html
   Enter: Your webhook URL
   Click: "Test Log Violation"
   Expected: Success message + new row in sheet
   ```

2. **Test the Extension**
   ```
   Open: Any Google Form
   Start: Exam
   Trigger: Violation (exit fullscreen)
   Check: Browser console for "[ServiceWorker] Sending to Google Sheets"
   Check: Google Sheet for new row
   ```

3. **Test Clear Functionality**
   ```
   In Sheet: Type "YES" in Cleared column
   Wait: 30 seconds
   Expected: Student sees "Violations cleared" notification
   ```

### Debug Logs to Look For

**In Browser Console (F12):**
```
[ExamLockdown] Initializing content script
[ExamLockdown] Config loaded
[ExamLockdown] Violation recorded
```

**In Extension Service Worker Console:**
```
[ServiceWorker] Received runtime message { type: 'REPORT_VIOLATION' }
[ServiceWorker] Sending to Google Sheets
[ServiceWorker] Payload: {"action":"logViolation","data":{...}}
[ServiceWorker] Google Sheets response status 200
[ServiceWorker] Google Sheets response { success: true, row: 2 }
```

### Still Not Working?

1. **Export your current config:**
   - Copy the entire `config.js` file
   - Save it as backup

2. **Try a minimal test:**
   - Use `test_google_sheets.html`
   - If this works, the issue is in the extension
   - If this fails, the issue is in Apps Script

3. **Check Apps Script Logs:**
   - In Apps Script editor
   - Click **Executions** (clock icon on left)
   - Look for recent executions
   - Click to see error details

4. **Redeploy Everything:**
   - Delete the current deployment
   - Create a new deployment
   - Get new URL
   - Update `config.js`
   - Reload extension

### Getting Help

If you're still stuck, gather this info:

1. Browser console screenshot (F12)
2. Extension service worker console screenshot
3. Apps Script execution log screenshot
4. Your `config.js` (remove sensitive URLs)
5. Description of what happens when you trigger a violation

## Quick Fix Commands

**Reload Extension:**
```
1. chrome://extensions/
2. Find "Exam Lockdown"
3. Click reload icon (🔄)
```

**Clear Extension Storage:**
```javascript
// Run in browser console on exam page
chrome.storage.local.clear()
chrome.storage.session.clear()
```

**Test Webhook in Console:**
```javascript
// Run in browser console
fetch('YOUR_WEBHOOK_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'logViolation',
    data: {
      sessionId: 'test',
      studentName: 'Test',
      studentEmail: 'test@test.com',
      formUrl: 'test',
      violationType: 'test',
      violationCount: 1,
      timestamp: new Date().toISOString(),
      status: 'warning'
    }
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```
