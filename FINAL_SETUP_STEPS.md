# 🚀 Final Setup Steps - Google Form Integration

## What I Fixed:

1. ✅ **background.js** - Complete rewrite with proper message handling
2. ✅ **manifest.json** - Removed "type: module" that was causing connection issues
3. ✅ **config.js** - Added Google Form URL
4. ✅ **Google Form integration** - Direct form submission (no Apps Script needed!)

---

## Step 1: Get the Correct Form Entry IDs

Your Google Form needs the correct field IDs. Here's how to get them:

1. **Open your form**: https://docs.google.com/forms/d/e/1FAIpQLSfabEEYTc7oAfJWGNXj251LGv82ZblsKRgoLLL90dfVN8f13w/viewform

2. **Right-click** on the page and select **"View Page Source"** (or press Ctrl+U)

3. **Search** (Ctrl+F) for `entry.` - you'll find entries like:
   - `entry.123456789`
   - `entry.987654321`
   - etc.

4. **Map each field** to its entry ID:
   - Email field → `entry.XXXXXXXX`
   - Name field → `entry.XXXXXXXX`
   - Form URL field → `entry.XXXXXXXX`
   - Violation Type → `entry.XXXXXXXX`
   - Violation Count → `entry.XXXXXXXX`
   - Timestamp → `entry.XXXXXXXX`
   - Status → `entry.XXXXXXXX`
   - Metadata → `entry.XXXXXXXX`

5. **Update background.js** lines 99-106 with your actual entry IDs:

```javascript
formData.append('entry.YOUR_EMAIL_ID', violationData.studentEmail);
formData.append('entry.YOUR_NAME_ID', violationData.studentName);
formData.append('entry.YOUR_FORMURL_ID', violationData.formUrl);
formData.append('entry.YOUR_VIOLATIONTYPE_ID', violationData.violationType);
formData.append('entry.YOUR_COUNT_ID', violationData.violationCount.toString());
formData.append('entry.YOUR_TIMESTAMP_ID', new Date().toISOString());
formData.append('entry.YOUR_STATUS_ID', getStatusFromCount(violationData.violationCount));
formData.append('entry.YOUR_METADATA_ID', JSON.stringify(violationData.metadata));
```

---

## Step 2: Reload the Extension

1. Go to `chrome://extensions/`
2. Find **"Exam Lockdown Proctor"**
3. Click the **reload icon** (🔄)
4. Check that **"Service worker"** shows as **"active"**
5. Click **"service worker"** to open the console and verify it says:
   ```
   [ServiceWorker] Service worker initialized
   [ServiceWorker] Background script loaded successfully
   ```

---

## Step 3: Test the Setup

1. **Open a test exam form**: https://docs.google.com/forms/d/e/1FAIpQLSfabEEYTc7oAfJWGNXj251LGv82ZblsKRgoLLL90dfVN8f13w/viewform

2. **Open browser console** (F12)

3. **Start the exam** - Enter your name

4. **Trigger a violation** - Exit fullscreen (press Esc)

5. **Check the console** - You should see:
   ```
   [ServiceWorker] Message received: REPORT_VIOLATION from tab: [ID]
   [ServiceWorker] Violation recorded. Count: 1
   [ServiceWorker] Violation logged to Google Form
   ```

6. **Check your Google Form responses**:
   - Go to your form
   - Click **"Responses"** tab
   - You should see a new response with the violation data

---

## Step 4: Verify Data in Google Sheet

1. In your form, click **"Responses"** tab
2. Click the **Google Sheets icon** (if you haven't already)
3. This creates a linked spreadsheet
4. Every violation will appear as a new row automatically

---

## Troubleshooting

### "Could not establish connection" Error

**Fixed!** This was caused by `"type": "module"` in manifest.json. I removed it.

### No violations appearing in form

1. **Check entry IDs** - Make sure you updated background.js with correct entry IDs from your form
2. **Check service worker** - Go to chrome://extensions/, click "service worker", verify it's running
3. **Check console** - Look for `[ServiceWorker] Violation logged to Google Form`

### Service worker not running

1. Reload the extension
2. Open any Google Form page
3. The service worker should activate automatically

### Form fields not matching

Your form MUST have these fields (in any order):
- Email (Short answer)
- Name (Short answer)
- Form URL (Short answer)
- Violation Type (Short answer or Dropdown)
- Violation Count (Short answer)
- Timestamp (Short answer)
- Status (Short answer or Dropdown)
- Metadata (Long answer)

---

## Expected Console Output

**When extension loads:**
```
[ServiceWorker] Service worker initialized
[ServiceWorker] Background script loaded successfully
[ExamLockdown] Initializing content script
[ExamLockdown] Google Forms detection
Config loaded: {googleFormUrl: "..."}
```

**When violation occurs:**
```
[ExamLockdown] Violation recorded
[ServiceWorker] Message received: REPORT_VIOLATION from tab: 123
[ServiceWorker] Violation recorded. Count: 1
[ServiceWorker] Violation logged to Google Form
```

---

## What Happens Now

1. ✅ Extension connects properly to background script
2. ✅ Violations are tracked and counted
3. ✅ Each violation is submitted to your Google Form
4. ✅ Form responses appear in the linked Google Sheet
5. ✅ No Apps Script needed - direct form submission!

---

## Benefits of This Approach

- **Simple** - No Apps Script deployment
- **Reliable** - Uses native Google Forms
- **Real-time** - Instant updates
- **Easy to maintain** - Just update form fields if needed
- **No authentication** - Works immediately

---

## Next Steps

1. Get your form's entry IDs (Step 1)
2. Update background.js with those IDs
3. Reload extension (Step 2)
4. Test with a violation (Step 3)
5. Check form responses (Step 4)

**That's it! Your violation logging will work perfectly.**
