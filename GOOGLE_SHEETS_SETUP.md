# Google Sheets Integration Setup Guide

This guide explains how to set up Google Sheets integration for logging exam violations and allowing administrators to clear violations.

## Features

- **Real-time Violation Logging**: All violations are automatically logged to a Google Sheet
- **Student Information**: Tracks student name, email, session ID, and violation details
- **Admin Clear Functionality**: Administrators can clear violations directly from the sheet
- **Automatic Notifications**: Students are notified within 30 seconds when violations are cleared
- **Violation Reports**: Generate summary reports of all violations

## Setup Instructions

### Step 1: Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it something like "Exam Lockdown Violations"

### Step 2: Add the Apps Script

1. In your Google Sheet, click **Extensions** > **Apps Script**
2. Delete any existing code in the editor
3. Copy the entire contents of `GoogleSheetsScript.gs` and paste it into the editor
4. Click the **Save** icon (💾) and name the project "Exam Lockdown Logger"

### Step 3: Deploy as Web App

1. In the Apps Script editor, click **Deploy** > **New deployment**
2. Click the gear icon (⚙️) next to "Select type" and choose **Web app**
3. Configure the deployment:
   - **Description**: "Exam Lockdown Webhook"
   - **Execute as**: **Me** (your account)
   - **Who has access**: **Anyone**
4. Click **Deploy**
5. **Important**: Copy the **Web App URL** (it will look like `https://script.google.com/macros/s/...`)
6. Click **Done**

### Step 4: Configure the Extension

1. Open `config.js` in the extension folder
2. Find the line: `googleSheetsWebhookUrl: ""`
3. Paste your Web App URL between the quotes:
   ```javascript
   googleSheetsWebhookUrl: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
   ```
4. Save the file
5. Reload the extension in Chrome (chrome://extensions/)

### Step 5: Test the Integration

1. Open a Google Form with the extension active
2. Start the exam and trigger a violation (e.g., exit fullscreen)
3. Check your Google Sheet - you should see a new row with the violation details

## Using the Admin Features

### Clearing Violations for a Student

**Method 1: Using the Menu (Recommended)**

1. Open your Google Sheet
2. Click on any row for the student whose violations you want to clear
3. Click **Exam Lockdown** menu > **Clear All Violations for Selected Student**
4. Confirm the action
5. The student will be notified within 30 seconds and can continue their exam

**Method 2: Manual Marking**

1. Find the student's row in the sheet
2. In the **Cleared** column (Column I), type `YES`
3. Optionally, add your name in the **Cleared By** column (Column J)
4. The student will be notified within 30 seconds

### Generating Reports

1. Click **Exam Lockdown** menu > **Export Violations Report**
2. A new "Summary" sheet will be created with aggregated violation data
3. This shows total violations per student and their current status

## Sheet Structure

The violations sheet contains the following columns:

| Column | Name | Description |
|--------|------|-------------|
| A | Timestamp | When the violation occurred |
| B | Session ID | Unique session identifier |
| C | Student Name | Student's full name |
| D | Student Email | Student's email address |
| E | Form URL | URL of the exam form |
| F | Violation Type | Type of violation (fullscreen-exit, tab-switch, etc.) |
| G | Violation Count | Current violation count for this student |
| H | Status | warning, lockout-short, lockout-long, or disqualified |
| I | Cleared | YES/NO - whether violations have been cleared |
| J | Cleared By | Email of admin who cleared violations |
| K | Cleared At | Timestamp when violations were cleared |

## Color Coding

- **Yellow**: Warning status (1st violation)
- **Orange**: Lockout status (2nd-3rd violations)
- **Red**: Disqualified status (4th+ violations)
- **Green**: Cleared by administrator

## Troubleshooting

### Violations Not Appearing in Sheet

1. Check that the Web App URL is correctly configured in `config.js`
2. Verify the Apps Script deployment is set to "Anyone" access
3. Check the browser console for error messages
4. Ensure the extension has been reloaded after configuration changes

### Clear Status Not Working

1. Make sure you typed exactly `YES` in the Cleared column (case-insensitive)
2. Wait up to 30 seconds for the student's browser to check the status
3. Check that the student's browser is still on the exam page
4. Verify the Apps Script has permission to access the sheet

### Permission Errors

1. Go to Apps Script editor
2. Click **Deploy** > **Manage deployments**
3. Click the edit icon (✏️) next to your deployment
4. Verify "Execute as" is set to "Me"
5. Verify "Who has access" is set to "Anyone"
6. Click **Deploy** to update

## Security Notes

- The Web App URL should be kept confidential
- Only share the Google Sheet with authorized administrators
- The extension sends data over HTTPS
- Student emails are only visible to those with sheet access
- Consider using Google Workspace permissions to restrict sheet access

## Advanced Configuration

### Changing Check Interval

By default, the extension checks for cleared violations every 30 seconds. To change this:

1. Open `content.js`
2. Find the line: `}, 30000); // Check every 30 seconds`
3. Change `30000` to your desired interval in milliseconds
   - 15 seconds: `15000`
   - 1 minute: `60000`
   - 2 minutes: `120000`

### Custom Violation Types

You can customize how different violation types are logged by modifying the `logViolation` function in `GoogleSheetsScript.gs`.

### Automated Clearing

You can create time-based triggers in Apps Script to automatically clear violations after a certain period:

1. In Apps Script editor, click the clock icon (⏰) for Triggers
2. Add a new trigger
3. Choose function: `autoClearOldViolations` (you'll need to create this function)
4. Set event source: Time-driven
5. Configure the schedule

## Support

For issues or questions:
1. Check the browser console for error messages
2. Check the Apps Script execution logs (View > Logs)
3. Verify all setup steps were completed correctly
4. Ensure the extension has the latest code changes
