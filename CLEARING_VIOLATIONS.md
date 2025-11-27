How to Clear Violations (Exam Lockdown)

Overview

This document explains how an administrator can clear recorded violations and how the extension detects and respects those clears.

Two supported ways to clear violations:

1) Manually in the Google Sheet (recommended)
2) Via the Apps Script webhook (automated)

A. Manually clearing via Google Sheet (recommended)

1. Open the Google Sheet used for Exam Lockdown (the one connected to the Apps Script web app).
2. Open the "Violations" sheet (tab named `Violations`).
3. Locate rows for the student you want to clear (match `Session ID` or `Student Email`).
4. In the "Resolved" column (column M, header "Resolved"), set the cell to `YES` for each violation you want to clear.
   - Optionally fill "Resolved By" (column N) and "Resolved At" (column O).
5. The Apps Script will mark the session cleared; the background service worker will detect the cleared status when clients poll or when you trigger a clearance check.

Notes:
- The extension checks the `Violations` sheet's "Resolved" column (column M) for the value `YES` (case-insensitive).
- The `Exam Sessions` sheet will be updated with Cleared=YES for the matching session.

B. Clearing via the Apps Script webhook (programmatic)

You can POST to the Apps Script web app URL with JSON to clear violations for an identifier (session ID or email).

Request format (POST JSON):

{
  "action": "clearViolations",
  "identifier": "<SESSION_ID or STUDENT_EMAIL>",
  "clearedBy": "Administrator Name"
}

Response:
- JSON with `success: true` and `clearedCount` indicating how many violation rows were marked.

C. How the extension detects a cleared violation

- The content script periodically asks the background (service worker) to check clearance using the `CHECK_CLEAR_STATUS` message.
- The background will check the configured clearance provider (Supabase) if enabled; otherwise it posts to the Google Sheets webhook (`action: 'checkClearStatus'`).
- If the webhook response indicates `cleared: true`, the extension will:
  - Set `violationCount = 0` locally
  - Clear local `submitted` locks for the form URL
  - Remove overlays so the student can continue

D. Troubleshooting

- If clearing in the sheet does not propagate to students:
  1. Ensure the cell in column M (Resolved) is exactly `YES` (not `Y`, `TRUE`, or `Processed`).
  2. Ensure the Apps Script web app was deployed as a Web App and the latest deployment URL (Deploy > Manage deployments) is in `config.js` as `googleSheetsWebhookUrl`.
  3. Open the Chrome extension background service worker console (chrome://extensions/ -> Find the extension -> Service worker) and look for logs that show the webhook check and response. The service worker now logs the webhook response body.
  4. If you see authentication or HTML login pages in responses, re-deploy the Apps Script and set "Who has access" to "Anyone" (or adjust to a secure option and update extension auth accordingly).

E. Final notes

- We cleaned and consolidated the Apps Script `clearViolations` logic so it consistently writes to the `Resolved` column (M) and updates the sessions sheet.
- The extension's background service worker will now query the Apps Script webhook when checking clearance, avoiding client-side CORS issues.

If you want, I can add a small Admin UI (inside the sheet or a separate admin page) that lists sessions and provides a one-click Clear button which calls the webhook. Would you like that?
