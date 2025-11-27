const SW_LOG_PREFIX = '[ServiceWorker]';
const STORAGE_KEYS = {
  SESSIONS: 'examLockdown.sessionStore'
};
const SESSION_TTL_MS = 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  allowAllGoogleForms: true,
  maxViolations: 4,
  cooldownMinutes: 5,
  warningCountdown: 30,
  adminEmailGroup: "reformer.ejembi@iworldnetworks.net",
  adminWebhookUrl: "",
  googleSheetsWebhookUrl: "https://script.google.com/macros/s/AKfycbxKQ6uSav6EqA97vRTao6ZnElUO_6MiaH0G9xLgqOeNMVVD-5RNUkF95X5FaVvFPwilcw/exec",
  enableRemoteConfig: false,
  remoteConfigUrl: "",
  violationCooldowns: {
    'visibilitychange': 1500,
    'window-blur': 1500,
    'keyboard': 1500,
    'fullscreen-exit': 3000,
    'heartbeat-miss': 0
  },
  heartbeatIntervalMs: 5000,
  heartbeatMissLimit: 2,
  autoLockOnHeartbeatMiss: true,
  suppressedAnalyticsUrl: "",
  integrityCheckIntervalMs: 4000,
  pointerLockOverlay: true,
  clearanceProvider: {
    enabled: false,
    type: 'supabase',
    supabaseUrl: '',
    supabaseAnonKey: '',
    clearanceTable: 'violation_clearances'
  }
};

let sessionStore = {};
let sessionStoreLoaded = false;

console.log(SW_LOG_PREFIX, 'Service worker initialized');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error(SW_LOG_PREFIX, 'Message handling failed:', error);
      sendResponse({ error: error?.message || 'Unknown background error' });
    });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(SW_LOG_PREFIX, 'Tab removed; session remains persisted', { tabId });
});

async function handleMessage(message, sender) {
  const type = message?.type;
  const data = message?.data || {};
  const tabUrl = sender?.tab?.url || '';

  console.log(SW_LOG_PREFIX, 'Message received:', type, 'tab:', sender?.tab?.id ?? 'n/a');

  switch (type) {
    case 'INIT_SESSION':
      return handleInitSession(data, tabUrl);
    case 'GET_VIOLATION_COUNT':
      return handleGetViolationCount(data, tabUrl);
    case 'REPORT_VIOLATION':
      return handleReportViolation(data, tabUrl);
    case 'HEARTBEAT':
      return { success: true, timestamp: Date.now() };
    case 'AUTO_SUBMIT':
      return handleAutoSubmit(data, tabUrl);
    case 'CHECK_CLEAR_STATUS':
      return handleCheckClearStatus(data, tabUrl);
    default:
      console.warn(SW_LOG_PREFIX, 'Unknown message type:', type);
      return { error: `Unknown message type: ${type}` };
  }

  return { error: 'Unhandled message type' };
}

async function getConfig() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return DEFAULT_CONFIG;
    }
    
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['configManager.cache'], resolve);
    });
    
    const cached = result['configManager.cache'];
    if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
      return cached.config;
    }
  } catch (error) {
    console.warn(SW_LOG_PREFIX, 'Failed to read cached config:', error);
  }
  return DEFAULT_CONFIG;
}

async function withRetry(operation, { maxRetries = 3, initialDelay = 1000 } = {}) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return { result, attempt };
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1) * (0.8 + 0.4 * Math.random()),
          30000 // Max 30 seconds
        );
        
        console.warn(SW_LOG_PREFIX, `Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

async function fetchSupabaseClearance(provider, params) {
  if (!provider.supabaseUrl || !provider.supabaseAnonKey) {
    console.warn(SW_LOG_PREFIX, 'Supabase credentials missing');
    return null;
  }

  try {
    const url = `${provider.supabaseUrl}/rest/v1/${provider.clearanceTable}?form_url=eq.${encodeURIComponent(params.formUrl)}&student_email=eq.${encodeURIComponent(params.studentEmail)}`;
    const headers = {
      apikey: provider.supabaseAnonKey,
      Authorization: `Bearer ${provider.supabaseAnonKey}`,
      Accept: 'application/json'
    };

    const { result: response } = await withRetry(
      () => fetch(url, { headers }),
      { maxRetries: 3, initialDelay: 1000 }
    );

    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const rows = await response.json();
    if (Array.isArray(rows) && rows.length > 0) {
      const record = rows[0];
      if (record.cleared) {
        return {
          cleared: true,
          clearedAt: record.cleared_at || new Date().toISOString()
        };
      }
    }
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Supabase clearance check failed after retries:', error);
  }

  return null;
}

async function handleInitSession(data, fallbackUrl) {
  const formUrl = normalizeFormUrl(data.formUrl || fallbackUrl);
  if (!formUrl) {
    return { error: 'Missing form URL for session initialization' };
  }

  await ensureSessionStore();
  const now = Date.now();
  await cleanupExpiredSessions(now);

  let session = sessionStore[formUrl];
  let modified = false;

  if (!session) {
    session = createSession(formUrl, data, now);
    sessionStore[formUrl] = session;
    modified = true;
  } else {
    if (data.studentName && data.studentName !== session.studentName) {
      session.studentName = data.studentName;
      modified = true;
    }
    if (data.studentEmail != null && data.studentEmail !== session.studentEmail) {
      session.studentEmail = data.studentEmail;
      modified = true;
    }
    if (data.examSubmitted && !session.examSubmitted) {
      session.examSubmitted = true;
      extendSessionExpiry(session, now);
      modified = true;
    }
    session.updatedAt = now;
  }

  if (modified) {
    await persistSessionStore();
  }

  return {
    success: true,
    sessionId: session.sessionId,
    violationCount: session.violationCount,
    expiresAt: session.expiresAt || null,
    examSubmitted: Boolean(session.examSubmitted),
    lastViolationAt: session.lastViolationAt || null,
    clearedAt: session.clearedAt || null
  };
}

async function handleGetViolationCount(data, fallbackUrl) {
  const formUrl = normalizeFormUrl(data.formUrl || fallbackUrl);
  if (!formUrl) {
    return { count: 0 };
  }

  await ensureSessionStore();
  const now = Date.now();
  await cleanupExpiredSessions(now);

  const session = sessionStore[formUrl];
  if (!session) {
    return { count: 0 };
  }

  return {
    count: session.violationCount || 0,
    expiresAt: session.expiresAt || null,
    examSubmitted: Boolean(session.examSubmitted),
    clearedAt: session.clearedAt || null
  };
}

async function handleReportViolation(data, fallbackUrl) {
  const formUrl = normalizeFormUrl(data.formUrl || fallbackUrl);
  if (!formUrl) {
    return { error: 'Missing form URL for violation' };
  }

  await ensureSessionStore();
  const now = Date.now();
  await cleanupExpiredSessions(now);

  let session = sessionStore[formUrl];
  if (!session) {
    session = createSession(formUrl, data, now);
  }

  if (session.examSubmitted) {
    console.log(SW_LOG_PREFIX, 'Ignoring violation report; session already submitted', { sessionId: session.sessionId });
    return { ignored: true, message: 'Session already submitted' };
  }

  const previousCount = session.violationCount || 0;
  const incrementedCount = Math.max(previousCount + 1, Number(data.violationCount) || 0);

  session.violationCount = incrementedCount;
  session.lastViolationAt = now;
  session.studentName = data.studentName || session.studentName || 'Unknown';
  session.studentEmail = data.studentEmail ?? session.studentEmail ?? '';
  session.updatedAt = now;
  extendSessionExpiry(session, now);
  session.clearedAt = null;

  const history = session.violationHistory || [];
  history.push({
    trigger: data.trigger || 'unknown',
    timestamp: now,
    metadata: data.metadata || {}
  });
  session.violationHistory = history.slice(-50);

  sessionStore[formUrl] = session;
  await persistSessionStore();

  await logViolationToGoogleSheets({
    studentName: session.studentName || 'Unknown',
    studentEmail: session.studentEmail || 'unknown@example.com',
    formUrl,
    violationType: data.trigger || 'unknown',
    violationCount: session.violationCount,
    metadata: data.metadata || {},
    sessionId: session.sessionId,
    ipAddress: data.ipAddress || '',
    userAgent: data.userAgent || ''
  });

  return {
    success: true,
    count: session.violationCount,
    expiresAt: session.expiresAt
  };
}

async function handleAutoSubmit(data, fallbackUrl) {
  const formUrl = normalizeFormUrl(data.formUrl || fallbackUrl);
  if (!formUrl) {
    return { error: 'Missing form URL for auto-submit' };
  }

  await ensureSessionStore();
  const now = Date.now();
  await cleanupExpiredSessions(now);

  let session = sessionStore[formUrl];
  if (!session) {
    session = createSession(formUrl, data, now);
  }

  session.examSubmitted = true;
  session.updatedAt = now;
  session.lastViolationAt = now;
  session.violationCount = Math.max(session.violationCount || 0, Number(data.finalViolationCount) || session.violationCount || 0);
  session.autoSubmit = {
    success: Boolean(data.success),
    method: data.method || null,
    recordedAt: new Date(now).toISOString()
  };
  extendSessionExpiry(session, now);

  sessionStore[formUrl] = session;
  await persistSessionStore();

  console.log(SW_LOG_PREFIX, 'Auto-submit recorded for session', session.sessionId);
  return { success: true, sessionId: session.sessionId };
}

async function handleCheckClearStatus(data, fallbackUrl) {
  const formUrl = normalizeFormUrl(data.formUrl || fallbackUrl);
  if (!formUrl) {
    return { success: false, error: 'Missing form URL for clearance check' };
  }

  await ensureSessionStore();
  const now = Date.now();
  await cleanupExpiredSessions(now);

  let session = sessionStore[formUrl];
  if (!session) {
    session = createSession(formUrl, data, now);
    sessionStore[formUrl] = session;
  }

  const provider = (await getConfig())?.clearanceProvider || {};
  if (provider.enabled && provider.type === 'supabase') {
    const clearance = await fetchSupabaseClearance(provider, {
      formUrl,
      studentEmail: data.studentEmail || session.studentEmail || '',
      studentName: data.studentName || session.studentName || ''
    });

    if (clearance?.cleared) {
      session.violationCount = 0;
      session.clearedAt = clearance.clearedAt || new Date().toISOString();
      session.updatedAt = now;
      session.violationHistory = [];
      sessionStore[formUrl] = session;
      await persistSessionStore();
      return { success: true, clearStatus: { cleared: true, clearedAt: session.clearedAt } };
    }
  } else {
    try {
      const cfg = await getConfig();
      const webhook = cfg.googleSheetsWebhookUrl;
      if (webhook) {
        const payload = {
          action: 'checkClearStatus',
          sessionId: data.sessionId || session.sessionId,
          studentEmail: data.studentEmail || session.studentEmail || ''
        };

        const { result: response } = await withRetry(() => fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }), { maxRetries: 3, initialDelay: 1000 });

        const text = await response.text().catch(() => null);
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }

        const cleared = (parsed && (parsed.cleared === true || parsed.clearStatus?.cleared === true)) || false;
        const clearedAt = (parsed && (parsed.clearedAt || parsed.clearStatus?.clearedAt)) || null;

        if (cleared) {
          session.violationCount = 0;
          session.clearedAt = clearedAt || new Date().toISOString();
          session.updatedAt = now;
          session.violationHistory = [];
          sessionStore[formUrl] = session;
          await persistSessionStore();
          return { success: true, clearStatus: { cleared: true, clearedAt: session.clearedAt, source: 'webhook' } };
        }
      }
    } catch (err) {
      console.warn(SW_LOG_PREFIX, 'Webhook clearance check failed', err);
    }
  }

  return { success: true, clearStatus: null };
}

function createSession(formUrl, seed, now) {
  return {
    sessionId: generateSessionId(),
    formUrl,
    studentName: seed.studentName || 'Unknown',
    studentEmail: seed.studentEmail || '',
    violationCount: Number(seed.violationCount) || 0,
    startedAt: now,
    lastViolationAt: seed.lastViolationAt || null,
    expiresAt: seed.expiresAt || null,
    examSubmitted: Boolean(seed.examSubmitted),
    clearedAt: seed.clearedAt || null,
    violationHistory: [],
    updatedAt: now
  };
}

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFormUrl(url) {
  if (!url) {
    return '';
  }
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    console.warn(SW_LOG_PREFIX, 'Failed to normalize form URL', { url, error: error?.message });
    return url;
  }
}

async function ensureSessionStore() {
  if (sessionStoreLoaded) {
    return sessionStore;
  }

  try {
    const result = await storageGet([STORAGE_KEYS.SESSIONS]);
    sessionStore = result[STORAGE_KEYS.SESSIONS] || {};
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Failed to load session store:', error);
    sessionStore = {};
  }

  sessionStoreLoaded = true;
  await cleanupExpiredSessions();
  return sessionStore;
}

async function cleanupExpiredSessions(now = Date.now()) {
  if (!sessionStoreLoaded) {
    return;
  }

  let modified = false;
  for (const [formUrl, session] of Object.entries(sessionStore)) {
    if (isSessionExpired(session, now)) {
      console.log(SW_LOG_PREFIX, 'Removing expired session', { formUrl, expiresAt: session.expiresAt });
      delete sessionStore[formUrl];
      modified = true;
    }
    if (session.clearedAt && session.expiresAt && session.expiresAt <= now) {
      session.clearedAt = null;
      modified = true;
    }
  }

  if (modified) {
    await persistSessionStore();
  }
}

function isSessionExpired(session, now = Date.now()) {
  if (!session) {
    return true;
  }
  if (!session.expiresAt) {
    return false;
  }
  return session.expiresAt <= now;
}

function extendSessionExpiry(session, now = Date.now()) {
  const targetExpiry = now + SESSION_TTL_MS;
  session.expiresAt = Math.max(session.expiresAt || 0, targetExpiry);
}

async function persistSessionStore() {
  if (!sessionStoreLoaded) {
    return;
  }
  try {
    await storageSet({ [STORAGE_KEYS.SESSIONS]: sessionStore });
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Failed to persist session store:', error);
  }
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(items || {});
    });
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

async function logViolationToGoogleSheets(violationData) {
  try {
    const config = await getConfig();
    const webhookUrl = config.googleSheetsWebhookUrl;
    
    if (!webhookUrl) {
      console.warn(SW_LOG_PREFIX, 'Google Sheets webhook URL not configured');
      return;
    }

    const payload = {
      action: 'logViolation',
      violationData: {
        sessionId: violationData.sessionId || '',
        studentName: violationData.studentName || 'Unknown',
        studentEmail: violationData.studentEmail || 'unknown@example.com',
        formUrl: violationData.formUrl || '',
        violationType: violationData.violationType || 'unknown',
        violationCount: Number(violationData.violationCount || 0),
        severity: getSeverityFromCount(Number(violationData.violationCount || 0)),
        status: getStatusFromCount(Number(violationData.violationCount || 0)),
        metadata: violationData.metadata || {},
        ipAddress: violationData.ipAddress || '',
        userAgent: violationData.userAgent || ''
      }
    };

    const { result: response } = await withRetry(
      () => fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      { maxRetries: 3, initialDelay: 1000 }
    );

    const text = await response.text().catch(() => null);
    if (!response.ok) {
      console.error(SW_LOG_PREFIX, `Failed to log violation: HTTP ${response.status}`, { statusText: response.statusText, body: text });
      return;
    }

    let result = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch (err) {
      console.warn(SW_LOG_PREFIX, 'Failed to parse webhook JSON response', err, 'raw:', text);
    }

    console.log(SW_LOG_PREFIX, 'Violation logged to Google Sheets', { parsed: result, raw: text });
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Failed to log violation to Google Sheets:', error);
  }
}

function getSeverityFromCount(count) {
  if (count >= 4) return 'critical';
  if (count >= 3) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

function getStatusFromCount(count) {
  if (count >= 4) return 'Disqualified';
  if (count >= 2) return 'Lockout';
  return 'Warning';
}

function keepAlive() {
  setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Intentionally empty - keep service worker alive
    });
  }, 20_000);
}

keepAlive();

console.log(SW_LOG_PREFIX, 'Background script loaded successfully');