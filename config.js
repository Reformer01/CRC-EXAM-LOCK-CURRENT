const SW_LOG_PREFIX = '[ExamLockdown]';
const DEFAULT_CONFIG = {
  allowAllGoogleForms: true,
  maxViolations: 4,
  cooldownMinutes: 5,
  warningCountdown: 30,
  adminEmailGroup: "reformer.ejembi@iworldnetworks.net",
  googleSheetsWebhookUrl: "https://script.google.com/macros/s/AKfycbxKQ6uSav6EqA97vRTao6ZnElUO_6MiaH0G9xLgqOeNMVVD-5RNUkF95X5FaVvFPwilcw/exec",
  enableRemoteConfig: false,
  violationCooldowns: {
    'visibilitychange': 1500,
    'window-blur': 1500,
    'keyboard': 1500,
    'mouse': 1500,
    'clipboard': 1500,
    'devtools': 1500
  }
};

let configCache = null;
let lastConfigFetch = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

async function getConfig() {
  const now = Date.now();
  if (configCache && (now - lastConfigFetch) < CONFIG_CACHE_TTL) {
    return configCache;
  }

  try {
    const result = await chrome.storage.local.get(['config']);
    if (result.config) {
      configCache = { ...DEFAULT_CONFIG, ...result.config };
      lastConfigFetch = now;
      return configCache;
    }
  } catch (error) {
    console.warn(SW_LOG_PREFIX, 'Error loading config:', error);
  }
  return { ...DEFAULT_CONFIG };
}

async function saveConfig(newConfig) {
  try {
    await chrome.storage.local.set({ config: newConfig });
    configCache = { ...DEFAULT_CONFIG, ...newConfig };
    lastConfigFetch = Date.now();
    return true;
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Error saving config:', error);
    return false;
  }
}

// Clear exam session state (local storage, session storage, IndexedDB)
async function clearExamSessionState(tabId, sessionId) {
  try {
    // Execute script in the tab's context
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (sessionId) => {
        // Clear localStorage
        localStorage.clear();
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        // Clear cookies for the current domain
        document.cookie.split(';').forEach(cookie => {
          const [name] = cookie.trim().split('=');
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        });
        
        // Clear IndexedDB databases
        return new Promise((resolve) => {
          const dbs = indexedDB.databases ? 
            indexedDB.databases() : 
            Promise.resolve([]);
          dbs.then((databases) => {
            const deletions = databases.map(db => 
              new Promise((res) => {
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = res;
                req.onerror = res;
              })
            );
            Promise.all(deletions).then(resolve);
          }).catch(resolve);
        });
      },
      args: [sessionId]
    });

    // Clear extension's local storage for this session
    const keysToRemove = [
      `examSession_${sessionId}`,
      `violationCount_${sessionId}`,
      'examSession',
      'violationCount',
      'examLocked',
      'examEndTime',
      'lastViolationTime'
    ];
    
    await chrome.storage.local.remove(keysToRemove);
    
    console.log(SW_LOG_PREFIX, 'Cleared exam session state for session:', sessionId);
    return { success: true };
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Error clearing exam session state:', error);
    return { success: false, error: error.message };
  }
}

// Log violation to Google Sheets with retry logic
async function logViolationToGoogleSheets(violationData) {
  const config = await getConfig();
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const response = await fetch(config.googleSheetsWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'logViolation',
          violationData: {
            ...violationData,
            timestamp: new Date().toISOString()
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(SW_LOG_PREFIX, 'Violation logged successfully:', result);
      return result;
      
    } catch (error) {
      attempt++;
      console.warn(SW_LOG_PREFIX, `Attempt ${attempt} failed to log violation:`, error);
      
      if (attempt >= maxRetries) {
        console.error(SW_LOG_PREFIX, 'Max retries reached, giving up:', error);
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Check if violations are cleared for a student
async function checkClearStatus(sessionId, studentEmail) {
  const config = await getConfig();
  
  try {
    const response = await fetch(config.googleSheetsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'checkClearStatus',
        sessionId: sessionId,
        studentEmail: studentEmail
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Error checking clear status:', error);
    return { success: false, error: error.message };
  }
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'logViolation':
          const result = await logViolationToGoogleSheets(request.violationData);
          sendResponse(result);
          break;
          
        case 'checkClearStatus':
          const status = await checkClearStatus(request.sessionId, request.studentEmail);
          sendResponse(status);
          break;
          
        case 'clearExamSession':
          const tabId = sender.tab ? sender.tab.id : null;
          if (!tabId) {
            throw new Error('No tab ID provided for clearing session');
          }
          const clearResult = await clearExamSessionState(tabId, request.sessionId);
          sendResponse(clearResult);
          break;
          
        case 'getConfig':
          const config = await getConfig();
          sendResponse({ success: true, config });
          break;
          
        case 'saveConfig':
          const saveResult = await saveConfig(request.config);
          sendResponse({ success: saveResult });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error(SW_LOG_PREFIX, 'Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  // Return true to indicate we'll respond asynchronously
  return true;
});

// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize with default config on first install
    saveConfig(DEFAULT_CONFIG);
    console.log(SW_LOG_PREFIX, 'Extension installed with default config');
  } else if (details.reason === 'update') {
    console.log(SW_LOG_PREFIX, `Extension updated from ${details.previousVersion} to ${chrome.runtime.getManifest().version}`);
  }
});

// Handle tab updates to inject content scripts when needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('docs.google.com/forms/')) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => console.error('Script injection failed:', err));
  }
});

// Initialize
(async () => {
  try {
    await getConfig(); // Initialize config cache
    console.log(SW_LOG_PREFIX, 'Service worker initialized');
  } catch (error) {
    console.error(SW_LOG_PREFIX, 'Initialization error:', error);
  }
})();