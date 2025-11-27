# Exam Lockdown Chrome Extension v2

A comprehensive Chrome extension that enforces exam integrity for Google Forms tests with progressive penalties, violation tracking, and admin notifications.

## Features

- **Automatic Activation**: Triggers on Google Forms response pages
- **Progressive Penalty System**: Escalating responses from warnings to auto-submission
- **Real-time Violation Detection**: Monitors tab switching, fullscreen exit, copy/paste attempts
- **Admin Notifications**: Detailed logging with webhook support
- **Secure Design**: No student-accessible options, tamper-resistant
- **Professional UI**: Clean overlays with countdown timers and progress bars

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will automatically activate on Google Forms pages

## Configuration

The extension uses hardcoded defaults for security:

```javascript
{
  maxViolations: 4,
  cooldownMinutes: 5,
  warningCountdown: 30,
  adminEmailGroup: "exam-admins@school.edu",
  adminWebhookUrl: "", // Optional webhook URL
  enableRemoteConfig: false,
  remoteConfigUrl: "" // Optional remote config URL
}
```

### Admin Configuration Options

1. **Managed Policies**: Set via Chrome Admin Console for domain-wide deployment
2. **Remote Configuration**: Optional JSON endpoint for dynamic updates
3. **Webhook Notifications**: POST violations to external systems

## Violation Handling

1. **First Violation**: Warning overlay with re-enter fullscreen button
2. **Second Violation**: 30-second lockout with countdown timer
3. **Third Violation**: 5-minute lockout with progress bar
4. **Fourth+ Violation**: Automatic form submission and disqualification

## Admin Notifications

Each violation generates a detailed log:

```json
{
  "sessionId": "12345_1634567890",
  "studentName": "John Doe",
  "studentEmail": "john.doe@school.edu",
  "formUrl": "https://docs.google.com/forms/d/EXAM_ID/viewform",
  "violationType": "fullscreen-exit",
  "violationCount": 2,
  "timestamp": "2025-01-15T10:22:00Z",
  "status": "lockout-short"
}
```

## Security Features

- No options page accessible to students
- Hardcoded security defaults
- Tamper-resistant design
- Secure violation tracking
- Admin-only configuration

## Technical Details

- **Manifest V3** compatible
- **Service Worker** background script
- **Content Script** injection on Google Forms
- **Chrome Identity API** for student identification
- **Chrome Storage API** for violation tracking

## Permissions Required

- `tabs`: Monitor tab activity
- `scripting`: Inject overlays and handlers
- `storage`: Track violation counts
- `identity`: Capture student email
- `alarms`: Manage lockout timers
- `activeTab`: Inject code into active Form tabs

## Browser Compatibility

- Chrome 88+ (Manifest V3 support required)
- Chromium-based browsers with extension support

## License

This extension is designed for educational institutions to maintain exam integrity. Use responsibly and in accordance with your institution's policies.