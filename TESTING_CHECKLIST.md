# Testing Checklist for CRC/CKA Exam Lockdown System

## Quick Overview
- **Bulk admin actions**: Clear violations, unlock sessions, bulk operations with concurrency safety
- **False-positive fixes**: Grace-period detection for system popups, form submission protection
- **Configurable duration**: Student can select exam time (30-120 minutes)
- **Email notifications**: Violation reports sent to students only when violations occur

## 1. Chrome Extension Testing (Both CRC & CKA)

### 1.1 Basic Exam Flow
- [ ] Open a Google Form
- [ ] Extension popup shows "Start Exam"
- [ ] Enter name and email (CRC only)
- [ ] Select duration and start
- [ ] Verify timer appears and counts down
- [ ] Verify violation badge shows "0/4"

### 1.2 False-Positive Violation Testing
- [ ] **System popup test**: Trigger a browser notification (e.g., from another app) - should NOT count as violation after 250ms
- [ ] **Form validation test**: Click submit with empty required fields - should NOT count as violation
- [ ] **Password manager test**: Let password manager auto-fill - should NOT count as violation
- [ ] **Quick alt-tab test**: Alt-tab away and back within 200ms - should NOT count as violation
- [ ] **Intentional violation test**: Alt-tab away for >500ms - SHOULD count as violation
- [ ] **Submit protection test**: Click submit button - violations suppressed for 3 seconds during transition

### 1.3 Violation Detection Still Works
- [ ] **F12**: Press F12 - should record critical violation
- [ ] **Ctrl+C**: Try to copy text - should record medium violation
- [ ] **Right-click**: Right-click - should record low violation
- [ ] **Fullscreen exit**: Exit fullscreen - should record high violation
- [ ] **DevTools open**: Open DevTools - should record critical violation

### 1.4 Email & Duration Testing
- [ ] **Duration selector**: Select 30 min, verify timer shows correct time
- [ ] **Time expiry**: Let timer run out (test with 1 min duration) - should lock with "time expired"
- [ ] **Email test**: Get 1-2 violations, then submit form - check email arrives with violation details
- [ ] **No violations test**: Submit with 0 violations - should NOT send email

## 2. Google Sheets Admin Testing

### 2.1 Bulk Operations (CRC & CKA)
- [ ] **Create test data**: Use a test Google Form to create 5-10 sessions with violations
- [ ] **Bulk clear from selection**: 
  - Select rows with violations
  - CRC Admin → Bulk: Clear Violations (from selection)
  - Verify violation counts reset to 0, Reset markers added
- [ ] **Bulk unlock from selection**:
  - Select locked sessions
  - CRC Admin → Bulk: Unlock Sessions (from selection)
  - Verify Unlock markers added, status changes
- [ ] **Bulk clear by paste**:
  - CRC Admin → Bulk: Clear Violations (paste IDs)
  - Paste 3 Session IDs (newline separated)
  - Verify only those sessions cleared
- [ ] **Bulk unlock by paste**: Same test for unlock
- [ ] **Unlock all Locked (Violations)**:
  - CRC Admin → Bulk: Unlock all Locked (Violations)
  - Should find and unlock all sessions with that status

### 2.2 Concurrency Testing (Advanced)
- [ ] **Two admins test**: Have two people run bulk operations simultaneously
  - Admin A clears violations for sessions 1-3
  - Admin B clears violations for sessions 4-6
  - Both should complete without errors, all sessions cleared
- [ ] **Same session test**: Two admins try to unlock same session
  - First should succeed, second should see already unlocked

### 2.3 Error Handling
- [ ] **Invalid Session IDs**: Paste fake/non-existent IDs - should show "missing IDs" in result
- [ ] **Empty selection**: Try bulk action with no selection - should show helpful error
- [ ] **Large selection**: Select >500 rows - should show extra confirmation dialog

## 3. Apps Script Deployment Testing

### 3.1 Update Deployment
- [ ] Open Google Sheet → Extensions → Apps Script
- [ ] Replace `GoogleSheetsScript.gs` with new version
- [ ] Save and Deploy as web app (New version)
- [ ] Test webhook URL still works

### 3.2 Email Authorization
- [ ] Run `Test Email (Authorize MailApp)` from admin menu
- [ ] Should prompt for MailApp permission
- [ ] After authorization, verify test email sends successfully

## 4. Cross-Browser Testing (Optional)
- [ ] **Chrome**: All features should work
- [ ] **Edge**: Should work (Chromium-based)
- [ ] **Firefox**: May have issues with fullscreen API - verify behavior

## 5. Performance Testing

### 5.1 Large Dataset
- [ ] Create 100+ test sessions with violations
- [ ] Run bulk clear on all - should complete within 30 seconds
- [ ] Verify no timeouts or "cell limit" errors

### 5.2 Memory Usage
- [ ] Keep exam running for 2+ hours
- [ ] Monitor browser memory usage - should not grow excessively
- [ ] Verify extension remains responsive

## 6. Production Rollout Checklist

### 6.1 Before Going Live
- [ ] Deploy updated Apps Script to production
- [ ] Update Chrome extension in Chrome Web Store
- [ ] Test with real student accounts
- [ ] Verify admin permissions for all staff

### 6.2 Monitoring Setup
- [ ] Check Google Sheets for new DebugLog entries
- [ ] Monitor email delivery rates
- [ ] Set up alerts for high violation rates

## Quick Test Script (For Developers)

```javascript
// In browser console on a form with extension loaded:
// Test 1: Trigger quick blur
document.hidden = true;
setTimeout(() => document.hidden = false, 100);

// Test 2: Check extension state
chrome.storage.local.get(null, console.log);

// Test 3: Manually trigger violation (if needed)
window.dispatchEvent(new Event('blur'));
```

## Troubleshooting Common Issues

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Violations still count on popups | Grace period too short | Increase `GRACE_PERIOD_MS` to 300-500 |
| Bulk action times out | Too many rows | Process in smaller batches |
| Email not sending | MailApp not authorized | Run "Test Email" menu item |
| Extension not loading | Manifest permissions | Check `manifest.json` permissions |

## Success Criteria

- [ ] No false-positive violations from system events
- [ ] Bulk operations complete under 30 seconds for 100 sessions
- [ ] Multiple admins can work simultaneously without corruption
- [ ] Students receive violation emails only when appropriate
- [ ] All existing functionality still works (no regressions)
