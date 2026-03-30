# CRC Sheet Collaborator Quick Guide

This guide is for staff/invigilators who were added to the CRC Google Sheet so they can (1) grant Apps Script permissions and (2) clear violations / unlock students.

## 1) Get access to the Sheet
- Open the shared CRC Google Sheet link.
- Make sure you are logged into the Google account that was granted access.

## 2) Authorize the Apps Script (one-time per Google account)
You may be prompted to authorize the script the first time you use an admin action.

### Option A (recommended): authorize via the Sheet menu
1. Open the sheet.
2. Refresh the page once.
3. In the top menu bar, click:
   - `CRC Admin` → `Test Email (Authorize MailApp)`
4. A Google authorization dialog will appear.
5. Click:
   - `Review permissions`
   - Choose your account
   - Click `Allow`

If Google shows an “unverified app” warning:
- Click `Advanced` → `Go to <project name> (unsafe)` → `Allow`.

### Option B: authorize by running a function in Apps Script
Only use this if you have access to the Apps Script project.
1. Sheet → `Extensions` → `Apps Script`.
2. Select `testSendEmail`.
3. Click `Run` and approve permissions.

## 3) Clearing violations for a student
Clearing violations removes rows in the `Violations` tab for that session, and also writes a reset marker so the student’s extension reliably resets.

### Clear violations for a single session
1. In the sheet, find the student’s `Session ID` in the `Sessions` tab.
2. Click `CRC Admin` → `Clear Violations by Session ID`.
3. Paste the Session ID → `OK`.
4. Confirm the result.

### Clear ALL violations
Use this only if you intend to reset the whole sheet.
1. Click `CRC Admin` → `Clear All Violations`.

## 4) Unlocking a locked student
Unlocking is used when a student hits max violations and gets locked.
1. Find the `Session ID` in the `Sessions` tab.
2. Click `CRC Admin` → `Unlock Session ID`.
3. Paste the Session ID → `OK`.

## 5) Where to verify results
- **`Sessions` tab**: Check `Status`, `Violation Count`, and `End Reason`.
- **`Violations` tab**: Should be cleared after a clear action.
- **`Resets` tab**: A reset marker row is added when violations are cleared.
- **`Unlocks` tab**: An unlock marker row is added when a student is unlocked.
- **`DebugLog` tab**: Troubleshooting info, including email send attempts/errors.

## 6) Common issues
- **Menu not showing**:
  - Refresh the sheet.
  - Ensure you have at least Editor access.
- **Permission error sending email**:
  - Run `CRC Admin` → `Test Email (Authorize MailApp)` and approve.
  - Ask the owner to redeploy the web app if permission scopes changed.
- **Student still sees old violations after clearing**:
  - Confirm a row was added to the `Resets` tab.
  - Have the student refresh the form page.

## 7) Google Sheets cell limit warning
Google Sheets has a limit of 10,000,000 cells per sheet. If you see:
> Exception: This action would increase the number of cells in the workbook above the limit of 10000000 cells.

### Why this happens
- Each violation row adds cells.
- Each session row adds cells.
- Logs (`DebugLog`, `Resets`, `Unlocks`) add cells over time.

### Mitigation
- **Archive old data**: Periodically create a new Sheet (e.g., each term) and update the Apps Script web app URL to point to the new sheet.
- **Clear old rows**: Use `CKA Admin` → `Clear All Violations` sparingly; this removes rows permanently.
- **Keep only current term**: Before clearing, copy current sessions to a new sheet, then clear the old one.

### Steps to create a new Sheet
1. Open the current Sheet.
2. File → Make a copy.
3. Rename the copy (e.g., “CKA Exam Log – 2025 Term 2”).
4. Share the new Sheet with collaborators.
5. Update the Apps Script project:
   - Open the script editor.
   - In `File` → `Project properties`, update the `Spreadsheet ID` to the new Sheet’s ID.
   - Save and redeploy the web app.
6. Update any documentation or collaborator guides with the new Sheet link.

> Note: If you’re well under the limit (e.g., under 500 rows), you don’t need to create a new sheet yet. This warning only appears when approaching 10,000,000 cells.

## What you should NOT do
- Do not delete rows manually in `Violations` unless instructed; use the `CRC Admin` menu so resets stay consistent for students.
