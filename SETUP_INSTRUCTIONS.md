# 🚀 Complete Setup Instructions

## Critical: You MUST Redeploy the Apps Script

After updating the `GoogleSheetsScript.gs` file, you **MUST** create a new deployment. Follow these exact steps:

### Step 1: Update the Apps Script Code

1. Open your Google Sheet
2. Go to **Extensions** > **Apps Script**
3. **Delete ALL existing code** in the editor
4. Copy the **entire contents** of `GoogleSheetsScript.gs`
5. Paste it into the Apps Script editor
6. Click **Save** (💾 icon)

### Step 2: Create a NEW Deployment

**IMPORTANT:** You must create a NEW deployment, not update the old one!

1. Click **Deploy** > **New deployment**
2. Click the gear icon (⚙️) next to "Select type"
3. Choose **Web app**
4. Fill in the settings:
   - **Description**: `Exam Lockdown v2` (or any name)
   - **Execute as**: **Me** (your Google account email)
   - **Who has access**: **Anyone**
5. Click **Deploy**
6. **Authorize** the script if prompted:
   - Click **Authorize access**
   - Choose your Google account
   - Click **Advanced** (if you see a warning)
   - Click **Go to [Your Project Name] (unsafe)**
   - Click **Allow**
7. **Copy the NEW Web App URL** (it will be different from the old one!)
8. Click **Done**

### Step 3: Update config.js

1. Open `config.js` in your extension folder
2. Find the line with `googleSheetsWebhookUrl`
3. Replace the URL with your **NEW** Web App URL:
   ```javascript
   googleSheetsWebhookUrl: "YOUR_NEW_URL_HERE"
   ```
4. Save the file

### Step 4: Reload the Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Find "Exam Lockdown Proctor"
4. Click the **reload icon** (🔄)

### Step 5: Test the Setup

1. Open `test_webhook_simple.html` in your browser
2. Paste your NEW webhook URL
3. Click **"Test GET (Check if Active)"**
   - You should see: `✅ GET SUCCESS!`
   - If you see an error, the deployment is not correct
4. Click **"Test POST (Log Violation)"**
   - You should see: `✅ POST SUCCESS!`
   - Check your Google Sheet for a new row

### Step 6: Test with Real Exam

1. Open any Google Form
2. The extension should load automatically
3. Start the exam
4. Trigger a violation (exit fullscreen)
5. Check your Google Sheet - you should see a new row

## Troubleshooting

### "Failed to fetch" Error

**Cause:** The Apps Script is not deployed correctly or the URL is wrong.

**Fix:**
1. Go to Apps Script editor
2. Click **Deploy** > **Manage deployments**
3. Check if a deployment exists
4. If not, create a new one (see Step 2 above)
5. If yes, verify:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the URL and update `config.js`

### "Authorization required" Error

**Cause:** You haven't authorized the script.

**Fix:**
1. In Apps Script editor, click **Deploy** > **Test deployments**
2. Click the URL to open it
3. Sign in and grant permissions
4. After granting permissions, create a NEW deployment

### Storage Access Error in Console

**Cause:** Google Forms has strict CSP policies.

**Fix:** This is now handled automatically. The extension will use `chrome.storage.local` which works on Google Forms pages.

### Violations Not Appearing in Sheet

**Check these in order:**

1. **Is the webhook URL correct?**
   - Run `test_webhook_simple.html`
   - If GET test fails, the URL is wrong

2. **Is the extension loaded?**
   - Go to `chrome://extensions/`
   - Make sure "Exam Lockdown Proctor" is enabled
   - Click reload

3. **Are violations being triggered?**
   - Open browser console (F12)
   - Look for `[ExamLockdown]` messages
   - Trigger a violation (exit fullscreen)
   - You should see violation messages

4. **Is the background script working?**
   - Go to `chrome://extensions/`
   - Click "service worker" under your extension
   - Look for `[ServiceWorker] Sending to Google Sheets`
   - If you don't see this, the violation isn't reaching the background script

## Verification Checklist

Before testing, make sure:

- [ ] Apps Script code is updated with the latest version
- [ ] NEW deployment created (not updated old one)
- [ ] Deployment settings: Execute as "Me", Access "Anyone"
- [ ] Web App URL copied
- [ ] `config.js` updated with NEW URL
- [ ] Extension reloaded at chrome://extensions/
- [ ] `test_webhook_simple.html` GET test passes
- [ ] `test_webhook_simple.html` POST test passes
- [ ] Google Sheet has "Violations" sheet with headers

## Expected Console Output

**When exam starts:**
```
[ExamLockdown] Initializing content script
[ExamLockdown] Google Forms detection
Config loaded: {googleSheetsWebhookUrl: "https://..."}
[ExamLockdown] Google Form detected in DOM
```

**When violation occurs:**
```
[ExamLockdown] Violation recorded
[ServiceWorker] Received runtime message { type: 'REPORT_VIOLATION' }
[ServiceWorker] Sending to Google Sheets
[ServiceWorker] Payload: {"action":"logViolation",...}
[ServiceWorker] Google Sheets response status 200
[ServiceWorker] Google Sheets response { success: true, row: 2 }
```

## Common Mistakes

1. **Using the old deployment URL** - Always create a NEW deployment after updating code
2. **Not authorizing the script** - You must grant permissions
3. **Wrong access settings** - Must be "Anyone", not "Anyone with the link"
4. **Not reloading the extension** - Changes won't apply until you reload
5. **Testing on a non-Google Forms page** - Extension only works on Google Forms

## Still Having Issues?

1. Delete ALL deployments in Apps Script
2. Create a completely NEW deployment
3. Get the NEW URL
4. Update `config.js`
5. Reload extension
6. Test with `test_webhook_simple.html`
7. If GET test fails, deployment is wrong
8. If POST test fails, script has an error

## Need to Start Fresh?

1. In Apps Script: **Deploy** > **Manage deployments**
2. Click the trash icon (🗑️) to delete all deployments
3. Follow Step 2 above to create a fresh deployment
4. Use the NEW URL everywhere
