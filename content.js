let historyInstrumentationApplied = false;

function ensureHistoryInstrumentation() {
  if (historyInstrumentationApplied) {
    return;
  }

  const dispatchUrlChange = () => {
    window.dispatchEvent(new Event('examlockdown:urlchange'));
  };

  const { pushState, replaceState } = history;

  history.pushState = function pushStatePatched(...args) {
    const result = pushState.apply(this, args);
    dispatchUrlChange();
    return result;
  };

  history.replaceState = function replaceStatePatched(...args) {
    const result = replaceState.apply(this, args);
    dispatchUrlChange();
    return result;
  };

  window.addEventListener('popstate', dispatchUrlChange);
  historyInstrumentationApplied = true;
}

const STORAGE_KEYS = {
  SESSION: 'examLockdown.sessionInfo',
  OVERLAY: 'examLockdown.overlayState',
  VIOLATION_TIMESTAMPS: 'examLockdown.violationTimestamps',
  SUPPRESSED_QUEUE: 'examLockdown.suppressedQueue'
};

const POINTER_LOCK_CLASS = 'exam-lockdown-overlay-active';
const DEFAULT_SUPPRESSED_QUEUE_LIMIT = 100;

class ExamLockdown {
  constructor() {
    try {
      console.log('ExamLockdown: Constructor called');
      this.violationCount = 0;
      this.studentName = '';
      this.isExamStarted = false;
      this.isFullscreen = false;
      this.currentOverlay = null;
      this.config = null;
      this.fullscreenListener = null;
      this.keepAlivePort = null;
      this.observer = null;
      this.reinitTimeoutId = null;
      this.sessionInfo = null;
      this.eventListeners = [];
      this.violationTimestamps = [];
      this.suppressedQueue = [];
      this.suppressedQueueLimit = DEFAULT_SUPPRESSED_QUEUE_LIMIT;
      this.heartbeatInterval = null;
      this.integrityCheckInterval = null;
      this.violationClearCheckInterval = null;
      this.storageArea = null;
      this.storageUnavailable = false;
      this.runtimeInvalidated = false;
      this.runtimeInvalidatedLogged = false;
      this.identityWarningLogged = false;
      this.lastKnownUrl = window.location.href;
      this.examSubmitted = false;
      this.isReturningToFullscreen = false;
      this.initialized = false;
      this.initializationError = null;
      this.submissionExpiryTimerId = null;
      this.submissionInProgress = false;
      
      this.examStartTime = null;
      this.timerInterval = null;
      this.lockoutCheck = null;
      this.timerElement = null;
      this.warningShown = false;
      this.finalWarningShown = false;
      this.examLocked = false;

      try {
        this.storageArea = chrome?.storage?.local || null;
        if (!this.storageArea) {
          console.warn('chrome.storage.local not available, using in-memory fallback');
          this.storageUnavailable = true;
        }
      } catch (error) {
        console.error('Error initializing storage:', error);
        this.storageUnavailable = true;
      }

      this.initialize();
    } catch (error) {
      console.error('Error in ExamLockdown constructor:', error);
      this.initializationError = error;
      this.initialize();
    }
  }

  scheduleSubmissionExpiryCheck(formUrl) {
    try {
      this.clearSubmissionExpiryCheck();
      this.submissionExpiryTimerId = setInterval(async () => {
        try {
          const stillSubmitted = await this.isFormUrlSubmitted(formUrl);
          if (!stillSubmitted) {
            this.clearSubmissionExpiryCheck();
            this.examSubmitted = false;
            this.isExamStarted = false;
            if (this.sessionInfo) {
              this.sessionInfo.examSubmitted = false;
            }
            try { this.clearIntegrityCheck(); } catch (e) {}
            try { this.clearHeartbeat(); } catch (e) {}
            try { this.clearViolationClearCheck(); } catch (e) {}
            await this.persistState();
            this.removeCurrentOverlay();
            this.showNotification('Submission lock expired. You may retake the exam.', 'success');
            this.isReturningToFullscreen = true;
            try { this.setupInitialOverlay(); } catch (e) { /* best-effort */ }
            setTimeout(() => { this.isReturningToFullscreen = false; }, 1500);
          }
        } catch (err) {
          console.warn('[ExamLockdown] submission expiry check failed', err);
        }
      }, 5000);
    } catch (err) {
      console.warn('[ExamLockdown] scheduleSubmissionExpiryCheck failed', err);
    }
  }

  clearSubmissionExpiryCheck() {
    if (this.submissionExpiryTimerId) {
      clearInterval(this.submissionExpiryTimerId);
      this.submissionExpiryTimerId = null;
    }
  }

  initialize() {
    try {
      setTimeout(() => {
        this.initComponents();
        this.setupEventListeners();
        this.initialized = true;
      }, 100);
    } catch (error) {
      console.error('Error during initialization:', error);
      this.initializationError = error;
      this.initialized = true;
    }
  }

  initComponents() {
    try {
      this.loadConfig();
    } catch (error) {
      console.error('Error initializing components:', error);
    }
  }

  setupEventListeners() {
    try {
      this.setupFullscreenListener();
      this.setupFormSubmissionListeners();
      this.setupUrlChangeListener();
      this.setupKeyboardProtection();
      this.initialized = true;
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }

  setupUrlChangeListener() {
    try {
      ensureHistoryInstrumentation();
      window.addEventListener('examlockdown:urlchange', () => {
        this.handleUrlChange();
      });
    } catch (error) {
      console.error('Error setting up URL change listener:', error);
    }
  }

  handleUrlChange() {
    try {
      if (this.initialized && !this.runtimeInvalidated) {
        this.initialize();
      }
    } catch (error) {
      console.error('Error handling URL change:', error);
    }
  }

  async getStorage(keys, fallback = null) {
    try {
      if (this.storageUnavailable || !this.storageArea) {
        return fallback;
      }

      const maybePromise = this.storageArea.get(keys);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return await maybePromise;
      }
    } catch (error) {
    }

    try {
      return await new Promise((resolve, reject) => {
        try {
          this.storageArea.get(keys, (result) => {
            const err = chrome?.runtime?.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(result);
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      this.handleStorageError(error, 'get');
      return fallback;
    }
  }

  async setStorage(items, fallback = false) {
    try {
      if (this.storageUnavailable || !this.storageArea) {
        return fallback;
      }

      const maybePromise = this.storageArea.set(items);
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
        return true;
      }
    } catch (error) {
    }

    try {
      return await new Promise((resolve, reject) => {
        try {
          this.storageArea.set(items, () => {
            const err = chrome?.runtime?.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(true);
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      this.handleStorageError(error, 'set');
      return fallback;
    }
  }

  async removeStorage(keys, fallback = false) {
    try {
      if (this.storageUnavailable || !this.storageArea) {
        return fallback;
      }

      const maybePromise = this.storageArea.remove(keys);
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
        return true;
      }
    } catch (error) {
    }

    try {
      return await new Promise((resolve, reject) => {
        try {
          this.storageArea.remove(keys, () => {
            const err = chrome?.runtime?.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(true);
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      this.handleStorageError(error, 'remove');
      return fallback;
    }
  }

  handleStorageError(error, operation) {
    if (!this.runtimeInvalidated) {
      console.error(`Storage ${operation} error:`, error);
    }
  }

  async loadConfig() {
    try {
      let config = null;

      if (window.configManager && window.configManager.getConfig) {
        await new Promise(resolve => {
          const checkManager = () => {
            if (window.configManager.hasLoaded) {
              resolve();
            } else {
              setTimeout(checkManager, 50);
            }
          };
          checkManager();
        });

        try {
          config = window.configManager.getConfig();
        } catch (err) {
          console.warn('configManager.getConfig failed:', err);
        }
      }

      if (typeof getConfig === 'function') {
        try {
          const fallbackConfig = getConfig();
          if (fallbackConfig && !config) {
            config = fallbackConfig;
          }
        } catch (err) {
          console.warn('getConfig() failed:', err);
        }
      }

      if (!config && chrome?.runtime?.sendMessage) {
        try {
          const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
          if (response && response.success && response.config) {
            config = response.config;
          }
        } catch (err) {
          console.warn('Background config request failed:', err);
        }
      }

      if (!config) {
        config = {
          allowAllGoogleForms: true,
          maxViolations: 4,
          cooldownMinutes: 5,
          warningCountdown: 30,
          adminEmailGroup: 'reformer.ejembi@iworldnetworks.net',
          googleSheetsWebhookUrl: 'https://script.google.com/macros/s/AKfycbxKQ6uSav6EqA97vRTao6ZnElUO_6MiaH0G9xLgqOeNMVVD-5RNUkF95X5FaVvFPwilcw/exec',
          enableRemoteConfig: false,
          remoteConfigUrl: '',
          violationCooldowns: {
            'visibilitychange': 1500,
            'window-blur': 1500,
            'keyboard': 1500,
            'mouse': 1500,
            'clipboard': 1500,
            'devtools': 1500
          }
        };
      }

      this.config = config;
      return config;
    } catch (error) {
      console.error('Error loading config:', error);
      this.config = {};
      return this.config;
    }
  }

  getCurrentFormUrl() {
    const url = window.location.href;
    const urlObj = new URL(url);
    return urlObj.pathname;
  }

  async isFormUrlSubmitted(formUrl) {
    try {
      const stored = await this.getStorage(['submittedForms']);
      const submittedForms = stored.submittedForms || {};

      if (submittedForms[formUrl]) {
        const submittedAt = submittedForms[formUrl];
        const now = Date.now();
        const oneHourInMs = 60 * 60 * 1000;

        if (now - submittedAt < oneHourInMs) {
          const remainingMinutes = Math.ceil((oneHourInMs - (now - submittedAt)) / 60000);
          console.log(`[ExamLockdown] Form still locked. ${remainingMinutes} minutes remaining.`);
          return true;
        } else {
          console.log('[ExamLockdown] Submission expired (>60 minutes). User can retake exam.');
          await this.removeExpiredFormSubmission(formUrl);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking form submission status:', error);
      return false;
    }
  }

  async markFormUrlAsSubmitted(formUrl) {
    try {
      const stored = await this.getStorage(['submittedForms']);
      const submittedForms = stored.submittedForms || {};
      submittedForms[formUrl] = Date.now();
      await this.setStorage({ submittedForms });
    } catch (error) {
      console.error('Error marking form as submitted:', error);
    }
  }

  async removeExpiredFormSubmission(formUrl) {
    try {
      const stored = await this.getStorage(['submittedForms']);
      const submittedForms = stored.submittedForms || {};
      delete submittedForms[formUrl];
      await this.setStorage({ submittedForms });
    } catch (error) {
      console.error('Error removing expired form submission:', error);
    }
  }

  startViolationClearCheck() {
    try {
      this.violationClearCheckInterval = setInterval(async () => {
        if (this.sessionInfo?.sessionId && this.userEmail) {
          try {
            let cleared = false;
            
            if (chrome?.runtime?.sendMessage) {
              try {
                const response = await chrome.runtime.sendMessage({
                  action: 'checkClearStatus',
                  sessionId: this.sessionInfo.sessionId,
                  studentEmail: this.userEmail
                });
                cleared = response && response.success && response.cleared;
              } catch (err) {
                console.warn('Background clear status check failed:', err);
              }
            }

            if (!cleared && this.config?.googleSheetsWebhookUrl) {
              try {
                const response = await fetch(this.config.googleSheetsWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'checkClearStatus',
                    sessionId: this.sessionInfo.sessionId,
                    studentEmail: this.userEmail
                  })
                });

                if (response.ok) {
                  const result = await response.json();
                  cleared = result && result.cleared;
                }
              } catch (err) {
                console.warn('Direct webhook clear status check failed:', err);
              }
            }

            if (cleared) {
              try {
                const stored = await this.getStorage(['submittedForms']);
                const submittedForms = stored.submittedForms || {};
                const currentFormUrl = this.getCurrentFormUrl();
                delete submittedForms[currentFormUrl];
                await this.setStorage({ submittedForms });
              } catch (err) {
                console.warn('Failed to clear submitted form:', err);
              }

              this.violationCount = 0;
              this.violationTimestamps = [];
              await this.persistState();
              this.showNotification('Violations have been cleared by admin. You may continue.', 'success');
            }
          } catch (error) {
            console.error('Error in violation clear check:', error);
          }
        }
      }, 30000);
    } catch (error) {
      console.error('Error starting violation clear check:', error);
    }
  }

  clearViolationClearCheck() {
    if (this.violationClearCheckInterval) {
      clearInterval(this.violationClearCheckInterval);
      this.violationClearCheckInterval = null;
    }
  }

  async handleViolation(violationType, details = {}) {
    try {
      if (this.examLocked || this.isReturningToFullscreen) {
        return;
      }

      if (this.examSubmitted) {
        return;
      }

      const now = Date.now();
      const lastViolationTime = this.violationTimestamps[violationType] || 0;
      const cooldownPeriod = this.config?.violationCooldowns?.[violationType] || 1500;

      if (now - lastViolationTime < cooldownPeriod) {
        return;
      }

      this.violationTimestamps[violationType] = now;
      this.violationCount++;

      await this.persistState();

      const violationData = {
        type: violationType,
        severity: this.getViolationSeverity(violationType),
        count: this.violationCount,
        timestamp: new Date().toISOString(),
        details: details,
        studentName: this.studentName,
        studentEmail: this.userEmail || '',
        formUrl: window.location.href
      };

      this.logViolation(violationData);

      if (this.violationCount >= this.config.maxViolations) {
        this.handleExamLockout();
      } else {
        this.showViolationWarning(violationType);
      }
    } catch (error) {
      console.error('Error handling violation:', error);
    }
  }

  getViolationSeverity(violationType) {
    const severityMap = {
      'visibilitychange': 'medium',
      'window-blur': 'medium',
      'keyboard': 'low',
      'mouse': 'low',
      'clipboard': 'medium',
      'devtools': 'high',
      'time_exceeded': 'high'
    };
    return severityMap[violationType] || 'medium';
  }

  async logViolation(violationData) {
    try {
      if (chrome?.runtime?.sendMessage) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'logViolation',
            violationData: violationData
          });

          if (response && response.success) {
            return;
          }
        } catch (err) {
          console.warn('Background violation logging failed:', err);
        }
      }

      if (this.config?.googleSheetsWebhookUrl) {
        try {
          const response = await fetch(this.config.googleSheetsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        } catch (err) {
          console.error('Direct webhook violation logging failed:', err);
        }
      }
    } catch (error) {
      console.error('Error logging violation:', error);
    }
  }

  showViolationWarning(violationType) {
    try {
      const warningMessages = {
        'visibilitychange': '⚠️ Warning: Tab switching detected!',
        'window-blur': '⚠️ Warning: Window focus lost!',
        'keyboard': '⚠️ Warning: Suspicious keyboard activity detected!',
        'mouse': '⚠️ Warning: Mouse movement outside exam area detected!',
        'clipboard': '⚠️ Warning: Copy/paste attempt detected!',
        'devtools': '🚨 CRITICAL: Developer tools opened!'
      };

      const message = warningMessages[violationType] || '⚠️ Warning: Suspicious activity detected!';
      const remainingViolations = this.config.maxViolations - this.violationCount;

      this.showNotification(`${message} (${remainingViolations} warnings remaining)`, 'warning');
    } catch (error) {
      console.error('Error showing violation warning:', error);
    }
  }

  handleExamLockout() {
    try {
      this.examLocked = true;
      this.showLockoutOverlay();
      this.logViolation({
        type: 'exam_lockout',
        severity: 'critical',
        count: this.violationCount,
        timestamp: new Date().toISOString(),
        details: 'Exam locked due to maximum violations',
        studentName: this.studentName,
        studentEmail: this.userEmail || '',
        formUrl: window.location.href
      });
    } catch (error) {
      console.error('Error handling exam lockout:', error);
    }
  }

  showLockoutOverlay() {
    try {
      const lockoutOverlay = document.createElement('div');
      lockoutOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        text-align: center;
        font-family: Arial, sans-serif;
      `;
      
      lockoutOverlay.innerHTML = `
        <div style="max-width: 600px; padding: 40px;">
          <h1 style="color: #dc3545; margin-bottom: 20px;">🚨 Exam Locked</h1>
          <h2 style="margin-bottom: 20px;">Maximum violations reached</h2>
          <p style="font-size: 18px; margin-bottom: 30px;">Your exam has been locked due to multiple violations. Please contact your instructor.</p>
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <p style="margin: 0;">Violations: ${this.violationCount}/${this.config.maxViolations}</p>
            <p style="margin: 0;">Student: ${this.studentName}</p>
            <p style="margin: 0;">Time: ${new Date().toLocaleString()}</p>
          </div>
          <p style="font-size: 14px; opacity: 0.8;">Please close this tab and contact your instructor for further instructions.</p>
        </div>
      `;
      
      document.body.appendChild(lockoutOverlay);

      const form = document.querySelector('form');
      if (form) {
        form.style.filter = 'blur(5px)';
        form.style.pointerEvents = 'none';
        
        const inputs = form.querySelectorAll('input, textarea, select, button');
        inputs.forEach(input => {
          input.disabled = true;
          input.style.pointerEvents = 'none';
        });
      }
    } catch (error) {
      console.error('Error showing lockout overlay:', error);
    }
  }

  showNotification(message, type = 'info') {
    try {
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        max-width: 300px;
        border-left: 4px solid #6b7280;
        animation: slideIn 0.3s ease-out;
      `;

      const colors = {
        success: { bg: '#065f46', border: '#10b981' },
        warning: { bg: '#92400e', border: '#f59e0b' },
        error: { bg: '#7f1d1d', border: '#ef4444' },
        info: { bg: '#1e40af', border: '#3b82f6' }
      };

      const color = colors[type] || colors.info;
      notification.style.backgroundColor = color.bg;
      notification.style.borderLeftColor = color.border;
      notification.textContent = message;

      document.body.appendChild(notification);

      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async initializeExam() {
    try {
      const currentFormUrl = this.getCurrentFormUrl();
      const isSubmitted = await this.isFormUrlSubmitted(currentFormUrl);

      if (isSubmitted) {
        this.showSubmittedLockOverlay();
        return;
      }

      await this.loadConfig();
      await this.restoreExamState();
      this.setupInitialOverlay();
    } catch (error) {
      console.error('Error initializing exam:', error);
    }
  }

  async restoreExamState() {
    try {
      const stored = await this.getStorage(STORAGE_KEYS.SESSION);
      if (stored && stored.sessionInfo) {
        this.sessionInfo = stored.sessionInfo;
        this.violationCount = stored.violationCount || 0;
        this.violationTimestamps = stored.violationTimestamps || {};
      }
    } catch (error) {
      console.error('Error restoring exam state:', error);
    }
  }

  async persistState() {
    try {
      const state = {
        sessionInfo: this.sessionInfo,
        violationCount: this.violationCount,
        violationTimestamps: this.violationTimestamps,
        examSubmitted: this.examSubmitted,
        examStartTime: this.examStartTime
      };

      await this.setStorage(state);
    } catch (error) {
      console.error('Error persisting state:', error);
    }
  }

  setupInitialOverlay() {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      overlay.innerHTML = `
        <div class="exam-overlay-content setup-content">
          <div class="exam-icon">📝</div>
          <h2>Exam Lockdown</h2>
          <p>Please enter your name to begin the exam.</p>
          <div class="input-group">
            <input type="text" id="student-name-input" placeholder="Enter your full name" maxlength="100">
          </div>
          <div class="exam-rules">
            <h3>📋 Exam Rules:</h3>
            <ul>
              <li>You must remain in fullscreen mode</li>
              <li>No tab switching or opening new windows</li>
              <li>No copy/paste or right-clicking</li>
              <li>No developer tools or keyboard shortcuts</li>
              <li>Maximum ${this.config.maxViolations} violations allowed</li>
            </ul>
          </div>
          <button class="exam-button" id="start-exam-btn">Start Exam</button>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      const input = document.getElementById('student-name-input');
      if (input) {
        input.focus();
      }

      const startBtn = document.getElementById('start-exam-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => this.startExam());
      }

      this.setupFormSubmissionListeners();
    } catch (error) {
      console.error('Error setting up initial overlay:', error);
    }
  }

  showSubmittedLockOverlay() {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      overlay.innerHTML = `
        <div class="exam-overlay-content warning-content">
          <div class="exam-icon">⏰</div>
          <h2>Exam Already Submitted</h2>
          <p>This exam has already been submitted. You must wait 60 minutes before retaking it.</p>
          <div class="countdown-container">
            <div class="countdown-timer" id="countdown-timer">--:--</div>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
          <div class="continue-section" id="continue-section" style="display: none;">
            <p>✅ You can now retake the exam!</p>
            <button class="exam-button" onclick="location.reload()">Start New Exam</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      this.startCountdown(3600);
    } catch (error) {
      console.error('Error showing submitted lock overlay:', error);
    }
  }

  startCountdown(totalSeconds) {
    const timerElement = document.getElementById('countdown-timer');
    const progressFill = document.getElementById('progress-fill');
    const continueSection = document.getElementById('continue-section');
    
    let remainingSeconds = totalSeconds;
    
    const interval = setInterval(() => {
      remainingSeconds--;
      
      if (timerElement) {
        timerElement.textContent = this.formatTime(remainingSeconds);
      }
      
      if (progressFill) {
        const progress = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
        progressFill.style.width = `${progress}%`;
      }
      
      if (remainingSeconds <= 0) {
        clearInterval(interval);
        
        if (continueSection) {
          continueSection.style.display = 'block';
        }
        
        if (timerElement) {
          timerElement.textContent = 'Ready!';
        }
      }
    }, 1000);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async startExam() {
    try {
      const nameInput = document.getElementById('student-name-input');
      if (!nameInput || !nameInput.value.trim()) {
        this.showNotification('Please enter your name to start the exam.', 'error');
        return;
      }

      this.studentName = nameInput.value.trim();
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'startSession',
          data: {
            studentName: this.studentName,
            studentEmail: this.userEmail || '',
            formUrl: window.location.href
          }
        });

        if (response && response.success && response.sessionInfo) {
          this.sessionInfo = response.sessionInfo;
        }
      } catch (err) {
        console.warn('Failed to start session with background:', err);
      }

      this.isExamStarted = true;
      this.examStartTime = Date.now();
      
      this.removeCurrentOverlay();
      this.showNotification(`Exam started for ${this.studentName}. Exam mode is now active.`, 'success');
      try {
        this.renderFinishButton();
      } catch (err) {
        console.warn('[ExamLockdown] renderFinishButton failed', err);
      }
      
      try {
        await document.documentElement.requestFullscreen();
      } catch (error) {
        console.error('Error requesting fullscreen:', error);
        this.showNotification('Failed to enter fullscreen. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error starting exam:', error);
    }
  }

  startExamTimer() {
    return;
  }

  createTimerDisplay() {
    return;
  }

  updateTimer() {
    return;
  }

  showWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #fff3cd;
      border: 2px solid #ffc107;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    warning.innerHTML = `
      <h3 style="color: #856404; margin: 0 0 10px 0;">⚠️ Time Warning</h3>
      <p style="margin: 0;">You have 5 minutes remaining to complete your exam.</p>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        padding: 8px 16px;
        background: #ffc107;
        color: #000;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">OK</button>
    `;
    
    document.body.appendChild(warning);

    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 5000);
  }

  showFinalWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #f8d7da;
      border: 2px solid #dc3545;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    warning.innerHTML = `
      <h3 style="color: #721c24; margin: 0 0 10px 0;">🚨 Final Warning</h3>
      <p style="margin: 0;">You have 1 minute remaining! Submit your exam now.</p>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        padding: 8px 16px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">OK</button>
    `;
    
    document.body.appendChild(warning);

    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 5000);
  }

  checkTimeLimit() {
    return;
  }

  lockoutExam() {
    return;
  }

  clearExamTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.lockoutCheck) {
      clearInterval(this.lockoutCheck);
      this.lockoutCheck = null;
    }
    
    if (this.timerElement) {
      this.timerElement.remove();
      this.timerElement = null;
    }
    
    this.warningShown = false;
    this.finalWarningShown = false;
  }

  renderFinishButton() {
    if (document.getElementById('exam-finish-button')) return;

    const button = document.createElement('button');
    button.id = 'exam-finish-button';
    button.className = 'exam-button';
    button.textContent = 'Finish Exam';
    button.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 9998;
      background: linear-gradient(135deg, #dc3545, #c82333);
    `;

    button.addEventListener('click', () => this.finishExam());
    document.body.appendChild(button);
  }

  async finishExam() {
    try {
      this.submissionInProgress = true;
      this.examSubmitted = true;
      this.isExamStarted = false;
      
      this.clearExamTimer();
      
      const currentFormUrl = this.getCurrentFormUrl();
      try { await this.markFormUrlAsSubmitted(currentFormUrl); } catch (err) {}
      await this.persistState();

      try {
        await this.submitGoogleForm();
        
        this.showSubmissionConfirmation();
        this.notifyBackgroundOfSubmission();
      } catch (error) {
        console.error('Submission failed:', error);
        this.showSubmissionError(error.message);
        this.submissionInProgress = false;
        this.examSubmitted = false;
      }
    } catch (error) {
      console.error('Error finishing exam:', error);
      this.submissionInProgress = false;
      this.examSubmitted = false;
    }
  }

  showSubmissionConfirmation() {
    const overlay = document.createElement('div');
    overlay.className = 'exam-overlay';
    overlay.innerHTML = `
      <div class="exam-overlay-content confirmation-content">
        <div class="exam-icon">✅</div>
        <h2>Exam Submitted Successfully!</h2>
        <p>Your exam has been submitted and recorded.</p>
        <div class="submission-info">
          <p><strong>Student:</strong> ${this.studentName}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Violations:</strong> ${this.violationCount}</p>
        </div>
        <div class="confirmation-message">
          <p>You may now close this tab. Thank you for completing the exam.</p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.currentOverlay = overlay;
  }

  showSubmissionError(message) {
    const overlay = document.createElement('div');
    overlay.className = 'exam-overlay';
    overlay.innerHTML = `
      <div class="exam-overlay-content disqualification-content">
        <div class="exam-icon">❌</div>
        <h2>Submission Failed</h2>
        <p>There was an error submitting your exam:</p>
        <p style="color: #fca5a5; font-style: italic;">${message}</p>
        <p>Please try again or contact your instructor.</p>
        <button class="exam-button" onclick="location.reload()">Try Again</button>
      </div>
    `;

    document.body.appendChild(overlay);
    this.currentOverlay = overlay;
  }

  async submitGoogleForm() {
    const submitButton = document.querySelector('div[role="button"][aria-label*="Submit"], button[aria-label*="Submit"], input[type="submit"]');
    
    if (submitButton) {
      submitButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const validationError = document.querySelector('[role="alert"], .freebirdFormviewerViewItemErrorBadge');
      if (validationError) {
        throw new Error('Form validation failed. Please check your answers.');
      }
      
      const confirmationPage = document.querySelector('.freebirdFormviewerViewResponseConfirmationMessage, [data-item-id="confirmationMessage"]');
      if (confirmationPage) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const confirmationAgain = document.querySelector('.freebirdFormviewerViewResponseConfirmationMessage, [data-item-id="confirmationMessage"]');
      if (confirmationAgain) {
        return;
      }
    }

    const form = document.querySelector('form');
    if (form) {
      const requiredFields = form.querySelectorAll('[required], [aria-required="true"]');
      const emptyRequired = Array.from(requiredFields).find(field => !field.value.trim());
      
      if (emptyRequired) {
        throw new Error('Please fill in all required fields.');
      }
      
      form.submit();
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Could not find submit button or form. Please submit manually.');
  }

  notifyBackgroundOfSubmission() {
    try {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'endSession',
          sessionInfo: this.sessionInfo
        }).catch(err => console.warn('Failed to notify background of submission:', err));
      }
    } catch (error) {
      console.error('Error notifying background of submission:', error);
    }
  }

  async logViolation(violationData) {
    try {
      if (chrome?.runtime?.sendMessage) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'logViolation',
            violationData: violationData
          });

          if (response && response.success) {
            return response;
          }
        } catch (err) {
          console.warn('Background violation logging failed:', err);
        }
      }

      if (this.config?.googleSheetsWebhookUrl) {
        try {
          const response = await fetch(this.config.googleSheetsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

          return await response.json();
        } catch (err) {
          console.error('Direct webhook violation logging failed:', err);
          throw err;
        }
      }
    } catch (error) {
      console.error('Error logging violation:', error);
      throw error;
    }
  }

  handleViolation(violationType, details = {}) {
    try {
      if (this.examLocked || this.isReturningToFullscreen || this.examSubmitted) {
        return;
      }

      const now = Date.now();
      const lastViolationTime = this.violationTimestamps[violationType] || 0;
      const cooldownPeriod = this.config?.violationCooldowns?.[violationType] || 1500;

      if (now - lastViolationTime < cooldownPeriod) {
        return;
      }

      this.violationTimestamps[violationType] = now;
      this.violationCount++;

      this.persistState();

      const violationData = {
        type: violationType,
        severity: this.getViolationSeverity(violationType),
        count: this.violationCount,
        timestamp: new Date().toISOString(),
        details: details,
        studentName: this.studentName,
        studentEmail: this.userEmail || '',
        formUrl: window.location.href
      };

      this.logViolation(violationData);

      if (this.violationCount >= this.config.maxViolations) {
        this.handleExamLockout();
      } else {
        this.showViolationWarning(violationType);
      }
    } catch (error) {
      console.error('Error handling violation:', error);
    }
  }

  getViolationSeverity(violationType) {
    const severityMap = {
      'visibilitychange': 'medium',
      'window-blur': 'medium',
      'keyboard': 'low',
      'mouse': 'low',
      'clipboard': 'medium',
      'devtools': 'high',
      'time_exceeded': 'high'
    };
    return severityMap[violationType] || 'medium';
  }

  showViolationWarning(violationType) {
    try {
      const warningMessages = {
        'visibilitychange': '⚠️ Warning: Tab switching detected!',
        'window-blur': '⚠️ Warning: Window focus lost!',
        'keyboard': '⚠️ Warning: Suspicious keyboard activity detected!',
        'mouse': '⚠️ Warning: Mouse movement outside exam area detected!',
        'clipboard': '⚠️ Warning: Copy/paste attempt detected!',
        'devtools': '🚨 CRITICAL: Developer tools opened!'
      };

      const message = warningMessages[violationType] || '⚠️ Warning: Suspicious activity detected!';
      const remainingViolations = this.config.maxViolations - this.violationCount;

      this.showNotification(`${message} (${remainingViolations} warnings remaining)`, 'warning');
    } catch (error) {
      console.error('Error showing violation warning:', error);
    }
  }

  handleExamLockout() {
    try {
      this.examLocked = true;
      this.showLockoutOverlay();
      this.logViolation({
        type: 'exam_lockout',
        severity: 'critical',
        count: this.violationCount,
        timestamp: new Date().toISOString(),
        details: 'Exam locked due to maximum violations',
        studentName: this.studentName,
        studentEmail: this.userEmail || '',
        formUrl: window.location.href
      });
    } catch (error) {
      console.error('Error handling exam lockout:', error);
    }
  }

  showLockoutOverlay() {
    try {
      const lockoutOverlay = document.createElement('div');
      lockoutOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        text-align: center;
        font-family: Arial, sans-serif;
      `;
      
      lockoutOverlay.innerHTML = `
        <div style="max-width: 600px; padding: 40px;">
          <h1 style="color: #dc3545; margin-bottom: 20px;">🚨 Exam Locked</h1>
          <h2 style="margin-bottom: 20px;">Maximum violations reached</h2>
          <p style="font-size: 18px; margin-bottom: 30px;">Your exam has been locked due to multiple violations. Please contact your instructor.</p>
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <p style="margin: 0;">Violations: ${this.violationCount}/${this.config.maxViolations}</p>
            <p style="margin: 0;">Student: ${this.studentName}</p>
            <p style="margin: 0;">Time: ${new Date().toLocaleString()}</p>
          </div>
          <p style="font-size: 14px; opacity: 0.8;">Please close this tab and contact your instructor for further instructions.</p>
        </div>
      `;
      
      document.body.appendChild(lockoutOverlay);

      const form = document.querySelector('form');
      if (form) {
        form.style.filter = 'blur(5px)';
        form.style.pointerEvents = 'none';
        
        const inputs = form.querySelectorAll('input, textarea, select, button');
        inputs.forEach(input => {
          input.disabled = true;
          input.style.pointerEvents = 'none';
        });
      }
    } catch (error) {
      console.error('Error showing lockout overlay:', error);
    }
  }

  showNotification(message, type = 'info') {
    try {
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        max-width: 300px;
        border-left: 4px solid #6b7280;
        animation: slideIn 0.3s ease-out;
      `;

      const colors = {
        success: { bg: '#065f46', border: '#10b981' },
        warning: { bg: '#92400e', border: '#f59e0b' },
        error: { bg: '#7f1d1d', border: '#ef4444' },
        info: { bg: '#1e40af', border: '#3b82f6' }
      };

      const color = colors[type] || colors.info;
      notification.style.backgroundColor = color.bg;
      notification.style.borderLeftColor = color.border;
      notification.textContent = message;

      document.body.appendChild(notification);

      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async initializeExam() {
    try {
      const currentFormUrl = this.getCurrentFormUrl();
      const isSubmitted = await this.isFormUrlSubmitted(currentFormUrl);

      if (isSubmitted) {
        this.showSubmittedLockOverlay();
        return;
      }

      await this.loadConfig();
      await this.restoreExamState();
      this.setupInitialOverlay();
    } catch (error) {
      console.error('Error initializing exam:', error);
    }
  }

  async restoreExamState() {
    try {
      const stored = await this.getStorage(STORAGE_KEYS.SESSION);
      if (stored && stored.sessionInfo) {
        this.sessionInfo = stored.sessionInfo;
        this.violationCount = stored.violationCount || 0;
        this.violationTimestamps = stored.violationTimestamps || {};
      }
    } catch (error) {
      console.error('Error restoring exam state:', error);
    }
  }

  async persistState() {
    try {
      const state = {
        sessionInfo: this.sessionInfo,
        violationCount: this.violationCount,
        violationTimestamps: this.violationTimestamps,
        examSubmitted: this.examSubmitted,
        examStartTime: this.examStartTime
      };

      await this.setStorage(state);
    } catch (error) {
      console.error('Error persisting state:', error);
    }
  }

  setupInitialOverlay() {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      overlay.innerHTML = `
        <div class="exam-overlay-content setup-content">
          <div class="exam-icon">📝</div>
          <h2>Exam Lockdown</h2>
          <p>Please enter your name to begin the exam.</p>
          <div class="input-group">
            <input type="text" id="student-name-input" placeholder="Enter your full name" maxlength="100">
          </div>
          <div class="exam-rules">
            <h3>📋 Exam Rules:</h3>
            <ul>
              <li>You must remain in fullscreen mode</li>
              <li>No tab switching or opening new windows</li>
              <li>No copy/paste or right-clicking</li>
              <li>No developer tools or keyboard shortcuts</li>
              <li>Maximum ${this.config.maxViolations} violations allowed</li>
            </ul>
          </div>
          <button class="exam-button" id="start-exam-btn">Start Exam</button>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      const input = document.getElementById('student-name-input');
      if (input) {
        input.focus();
      }

      const startBtn = document.getElementById('start-exam-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => this.startExam());
      }

      this.setupFormSubmissionListeners();
    } catch (error) {
      console.error('Error setting up initial overlay:', error);
    }
  }

  showSubmittedLockOverlay() {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      overlay.innerHTML = `
        <div class="exam-overlay-content warning-content">
          <div class="exam-icon">⏰</div>
          <h2>Exam Already Submitted</h2>
          <p>This exam has already been submitted. You must wait 60 minutes before retaking it.</p>
          <div class="countdown-container">
            <div class="countdown-timer" id="countdown-timer">--:--</div>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
          <div class="continue-section" id="continue-section" style="display: none;">
            <p>✅ You can now retake the exam!</p>
            <button class="exam-button" onclick="location.reload()">Start New Exam</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      this.startCountdown(3600);
    } catch (error) {
      console.error('Error showing submitted lock overlay:', error);
    }
  }

  startCountdown(totalSeconds) {
    const timerElement = document.getElementById('countdown-timer');
    const progressFill = document.getElementById('progress-fill');
    const continueSection = document.getElementById('continue-section');
    
    let remainingSeconds = totalSeconds;
    
    const interval = setInterval(() => {
      remainingSeconds--;
      
      if (timerElement) {
        timerElement.textContent = this.formatTime(remainingSeconds);
      }
      
      if (progressFill) {
        const progress = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
        progressFill.style.width = `${progress}%`;
      }
      
      if (remainingSeconds <= 0) {
        clearInterval(interval);
        
        if (continueSection) {
          continueSection.style.display = 'block';
        }
        
        if (timerElement) {
          timerElement.textContent = 'Ready!';
        }
      }
    }, 1000);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async startExam() {
    try {
      const nameInput = document.getElementById('student-name-input');
      if (!nameInput || !nameInput.value.trim()) {
        this.showNotification('Please enter your name to start the exam.', 'error');
        return;
      }

      this.studentName = nameInput.value.trim();
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'startSession',
          data: {
            studentName: this.studentName,
            studentEmail: this.userEmail || '',
            formUrl: window.location.href
          }
        });

        if (response && response.success && response.sessionInfo) {
          this.sessionInfo = response.sessionInfo;
        }
      } catch (err) {
        console.warn('Failed to start session with background:', err);
      }

      this.isExamStarted = true;
      this.examStartTime = Date.now();
      
      this.removeCurrentOverlay();
      this.showNotification(`Exam started for ${this.studentName}. Exam mode is now active.`, 'success');
      try {
        this.renderFinishButton();
      } catch (err) {
        console.warn('[ExamLockdown] renderFinishButton failed', err);
      }
      
      try {
        await document.documentElement.requestFullscreen();
      } catch (error) {
        console.error('Error requesting fullscreen:', error);
        this.showNotification('Failed to enter fullscreen. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error starting exam:', error);
    }
  }

  setupFullscreenListener() {
    try {
      const handleFullscreenChange = () => {
        const isFullscreen = document.fullscreenElement !== null;
        
        if (!isFullscreen && this.isExamStarted && !this.examSubmitted && !this.isReturningToFullscreen) {
          this.handleViolation('visibilitychange');
          this.showFullscreenWarning();
        } else if (isFullscreen && this.currentOverlay) {
          this.removeCurrentOverlay();
        }
        
        this.isFullscreen = isFullscreen;
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      this.fullscreenListener = handleFullscreenChange;
    } catch (error) {
      console.error('Error setting up fullscreen listener:', error);
    }
  }

  setupKeyboardProtection() {
    try {
      const handleKeyDown = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;

        const key = e.key.toLowerCase();
        const ctrl = e.ctrlKey || e.metaKey;
        const alt = e.altKey;
        const shift = e.shiftKey;

        // Block dangerous combinations
        const blockedCombinations = [
          // Tab switching
          { ctrl: true, key: 'tab' },
          { ctrl: true, key: 'tab', shift: true },
          { ctrl: true, key: 'pageup' },
          { ctrl: true, key: 'pagedown' },
          { ctrl: true, key: '1' },
          { ctrl: true, key: '2' },
          { ctrl: true, key: '3' },
          { ctrl: true, key: '4' },
          { ctrl: true, key: '5' },
          { ctrl: true, key: '6' },
          { ctrl: true, key: '7' },
          { ctrl: true, key: '8' },
          { ctrl: true, key: '9' },
          
          // Window management
          { alt: true, key: 'tab' },
          { alt: true, key: 'f4' },
          { alt: true, key: 'escape' },
          { alt: true, key: 'space' },
          { alt: true, key: 'enter' },
          
          // System shortcuts
          { ctrl: true, key: 'escape' },
          { ctrl: true, key: 'w' },
          { ctrl: true, key: 'n' },
          { ctrl: true, key: 't' },
          { ctrl: true, key: 'shift', key: 't' },
          { ctrl: true, key: 'shift', key: 'w' },
          { ctrl: true, key: 'shift', key: 'n' },
          
          // Function keys (F1-F12)
          { key: 'f1' }, { key: 'f2' }, { key: 'f3' }, { key: 'f4' },
          { key: 'f5' }, { key: 'f6' }, { key: 'f7' }, { key: 'f8' },
          { key: 'f9' }, { key: 'f10' }, { key: 'f11' }, { key: 'f12' },
          
          // Developer tools
          { ctrl: true, key: 'shift', key: 'i' },
          { ctrl: true, key: 'shift', key: 'j' },
          { ctrl: true, key: 'shift', key: 'c' },
          { ctrl: true, key: 'shift', key: 'k' },
          { ctrl: true, key: 'shift', key: 'o' },
          { ctrl: true, key: 'shift', key: 's' },
          { ctrl: true, key: 'shift', key: 'p' },
          { ctrl: true, key: 'shift', key: 'u' },
          { ctrl: true, key: 'shift', key: 'a' },
          { ctrl: true, key: 'shift', key: 'm' },
          { ctrl: true, key: 'shift', key: 'd' },
          { ctrl: true, key: 'shift', key: 'e' },
          { ctrl: true, key: 'shift', key: 'v' },
          { ctrl: true, key: 'shift', key: 'y' },
          { ctrl: true, key: 'shift', key: 'z' },
          
          // Pause/Break key
          { key: 'pause' },
          { key: 'break' },
          
          // Escape key (for dialog dismissal)
          { key: 'escape' },
          
          // Windows key
          { key: 'meta' },
          { meta: true, key: 'tab' },
          
          // Application key
          { key: 'apps' },
          
          // Print screen
          { key: 'printscreen' },
          { key: 'prtscr' },
          { key: 'prtsc' },
          
          // Scroll lock
          { key: 'scrolllock' },
          { key: 'scroll' },
          
          // Insert
          { key: 'insert' },
          { key: 'ins' },
          
          // Delete
          { key: 'delete' },
          { key: 'del' },
          
          // Home/End
          { key: 'home' },
          { key: 'end' },
          
          // Arrow keys (when combined with modifiers)
          { ctrl: true, key: 'arrowup' },
          { ctrl: true, key: 'arrowdown' },
          { ctrl: true, key: 'arrowleft' },
          { ctrl: true, key: 'arrowright' },
          { alt: true, key: 'arrowup' },
          { alt: true, key: 'arrowdown' },
          { alt: true, key: 'arrowleft' },
          { alt: true, key: 'arrowright' },
        ];

        // Check if current key combination should be blocked
        const isBlocked = blockedCombinations.some(combo => {
          const ctrlMatch = !combo.ctrl || ctrl;
          const altMatch = !combo.alt || alt;
          const shiftMatch = !combo.shift || shift;
          const metaMatch = !combo.meta || e.metaKey;
          const keyMatch = combo.key === key;
          
          return ctrlMatch && altMatch && shiftMatch && metaMatch && keyMatch;
        });

        if (isBlocked) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          this.handleViolation('keyboard');
          return false;
        }

        // Allow only basic input keys for form fields
        const allowedKeys = [
          'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
          'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
          '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
          'backspace', 'delete', 'tab', 'enter', 'space',
          'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
          'home', 'end', 'pageup', 'pagedown'
        ];

        // Allow basic typing in input fields
        const isInputField = e.target.tagName === 'INPUT' || 
                           e.target.tagName === 'TEXTAREA' || 
                           e.target.contentEditable === 'true';

        if (!isInputField && !allowedKeys.includes(key)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          this.handleViolation('keyboard');
          return false;
        }
      };

      const handleKeyUp = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;

        // Additional monitoring for key release events
        const key = e.key.toLowerCase();
        const suspiciousKeys = ['tab', 'escape', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'];
        
        if (suspiciousKeys.includes(key)) {
          this.handleViolation('keyboard');
        }
      };

      const handleContextMenu = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.handleViolation('keyboard');
        return false;
      };

      const handleCopy = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.handleViolation('keyboard');
        return false;
      };

      const handlePaste = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.handleViolation('keyboard');
        return false;
      };

      const handleCut = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.handleViolation('keyboard');
        return false;
      };

      // Add all event listeners
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keyup', handleKeyUp, true);
      document.addEventListener('contextmenu', handleContextMenu, true);
      document.addEventListener('copy', handleCopy, true);
      document.addEventListener('paste', handlePaste, true);
      document.addEventListener('cut', handleCut, true);

      // Additional mouse protection
      const handleMouseUp = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        // Check if right-click was attempted
        if (e.button === 2) {
          this.handleViolation('keyboard');
        }
      };

      const handleAuxClick = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        // Block middle-click and other auxiliary clicks
        if (e.button !== 0) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          this.handleViolation('keyboard');
          return false;
        }
      };

      // Window focus/blur protection
      const handleWindowBlur = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        // Small delay to avoid false positives during legitimate interactions
        setTimeout(() => {
          if (document.hidden || !document.hasFocus()) {
            this.handleViolation('visibilitychange');
          }
        }, 100);
      };

      const handleWindowFocus = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        // Check if devtools might be open (window size changes)
        setTimeout(() => {
          const outerWidth = window.outerWidth;
          const outerHeight = window.outerHeight;
          const innerWidth = window.innerWidth;
          const innerHeight = window.innerHeight;
          
          // If there's a significant difference, devtools might be open
          if (outerWidth - innerWidth > 200 || outerHeight - innerHeight > 200) {
            this.handleViolation('devtools');
          }
        }, 200);
        
        // Log when window regains focus (might indicate switching back)
        if (this.isFullscreen) {
          // User returned to fullscreen window
          this.isReturningToFullscreen = true;
          setTimeout(() => {
            this.isReturningToFullscreen = false;
          }, 1000);
        }
      };

      const handleVisibilityChange = (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        if (document.hidden) {
          this.handleViolation('visibilitychange');
        }
      };

      // DevTools detection
      const checkDevTools = () => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        // Method 1: Check if devtools is open by looking at console
        const devtools = /./;
        devtools.toString = () => {
          this.handleViolation('devtools');
          return 'devtools detection';
        };
        
        // Method 2: Check window dimensions
        const threshold = 160;
        if (window.outerHeight - window.innerHeight > threshold || 
            window.outerWidth - window.innerWidth > threshold) {
          this.handleViolation('devtools');
        }
      };

      // Check for devtools periodically
      const devtoolsCheckInterval = setInterval(() => {
        checkDevTools();
      }, 1000);

      // Store cleanup functions
      this.eventListeners.push(() => {
        clearInterval(devtoolsCheckInterval);
      });

      // Add mouse and window event listeners
      document.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('auxclick', handleAuxClick, true);
      window.addEventListener('blur', handleWindowBlur, true);
      window.addEventListener('focus', handleWindowFocus, true);
      document.addEventListener('visibilitychange', handleVisibilityChange, true);

      // Store cleanup functions
      this.eventListeners.push(() => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
        document.removeEventListener('contextmenu', handleContextMenu, true);
        document.removeEventListener('copy', handleCopy, true);
        document.removeEventListener('paste', handlePaste, true);
        document.removeEventListener('cut', handleCut, true);
        document.removeEventListener('mouseup', handleMouseUp, true);
        document.removeEventListener('auxclick', handleAuxClick, true);
        window.removeEventListener('blur', handleWindowBlur, true);
        window.removeEventListener('focus', handleWindowFocus, true);
        document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      });

    } catch (error) {
      console.error('Error setting up keyboard protection:', error);
    }
  }

  showFullscreenWarning() {
    try {
      if (this.currentOverlay) return;

      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      overlay.innerHTML = `
        <div class="exam-overlay-content warning-content">
          <div class="exam-icon">⚠️</div>
          <h2>Fullscreen Required</h2>
          <p>You must remain in fullscreen mode to continue the exam.</p>
          <p>Please press F11 or click the button below to re-enter fullscreen.</p>
          <button class="exam-button" onclick="document.documentElement.requestFullscreen()">Enter Fullscreen</button>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;
    } catch (error) {
      console.error('Error showing fullscreen warning:', error);
    }
  }

  setupFormSubmissionListeners() {
    try {
      const observer = new MutationObserver(() => {
        this.attachSubmitListeners();
      });

      const target = document.body || document.documentElement;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
        this.eventListeners.push(() => observer.disconnect());
      }

      const clickHandler = (e) => {
        try {
          const el = e.target;
          if (!el) return;
          const tag = el.tagName && el.tagName.toLowerCase();
          if (tag === 'button' && (el.type === 'submit' || el.getAttribute('role') === 'button')) {
            this.submissionInProgress = true;
            setTimeout(() => { this.submissionInProgress = false; }, 5000);
          }
        } catch (err) {
        }
      };

      document.addEventListener('click', clickHandler, true);
      this.eventListeners.push(() => document.removeEventListener('click', clickHandler, true));

      this.attachSubmitListeners();
    } catch (error) {
      console.error('Error setting up form submission listeners:', error);
    }
  }

  attachSubmitListeners() {
    try {
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        if (!form.hasAttribute('data-exam-listener')) {
          form.setAttribute('data-exam-listener', 'true');
          
          form.addEventListener('submit', async (e) => {
            try {
              this.submissionInProgress = true;
              this.examSubmitted = true;
              this.isExamStarted = false;
              
              const currentFormUrl = this.getCurrentFormUrl();
              try { await this.markFormUrlAsSubmitted(currentFormUrl); } catch (err) {}
              await this.persistState();

              try {
                if (chrome?.runtime?.sendMessage) {
                  chrome.runtime.sendMessage({
                    action: 'endSession',
                    sessionInfo: this.sessionInfo
                  }).catch(err => console.warn('Failed to end session:', err));
                }
              } catch (err) {
              }

              this.showSubmissionConfirmation();
              this.clearAllIntervals();
            } catch (error) {
              console.error('Error handling form submission:', error);
            }
          }, true);

          form.addEventListener('click', (e) => {
            const submitButton = e.target.closest('button[type="submit"], div[role="button"][aria-label*="Submit"]');
            if (submitButton) {
              this.submissionInProgress = true;
              setTimeout(() => { this.submissionInProgress = false; }, 5000);
            }
          }, true);
        }
      });
    } catch (error) {
      console.error('Error attaching submit listeners:', error);
    }
  }

  clearAllIntervals() {
    try {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.integrityCheckInterval) {
        clearInterval(this.integrityCheckInterval);
        this.integrityCheckInterval = null;
      }
      if (this.violationClearCheckInterval) {
        clearInterval(this.violationClearCheckInterval);
        this.violationClearCheckInterval = null;
      }
      if (this.submissionExpiryTimerId) {
        clearInterval(this.submissionExpiryTimerId);
        this.submissionExpiryTimerId = null;
      }
    } catch (error) {
      console.error('Error clearing intervals:', error);
    }
  }

  removeCurrentOverlay() {
    try {
      if (this.currentOverlay && this.currentOverlay.parentElement) {
        this.currentOverlay.remove();
        this.currentOverlay = null;
      }
    } catch (error) {
      console.error('Error removing current overlay:', error);
    }
  }

  cleanup() {
    try {
      this.clearAllIntervals();
      this.removeCurrentOverlay();
      
      if (this.fullscreenListener) {
        document.removeEventListener('fullscreenchange', this.fullscreenListener);
        this.fullscreenListener = null;
      }

      this.eventListeners.forEach(cleanup => {
        try {
          cleanup();
        } catch (err) {
          console.warn('Cleanup error:', err);
        }
      });
      this.eventListeners = [];
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

function areChromeApisAvailable() {
  return typeof chrome !== 'undefined' && 
         chrome.runtime && 
         chrome.storage && 
         chrome.storage.local;
}

function initExamLockdown() {
  try {
    console.log('ExamLockdown: Starting initialization...');
    console.log('ExamLockdown: Current URL:', window.location.href);
    
    if (!areChromeApisAvailable()) {
      console.error('Exam Lockdown: Required Chrome extension APIs are not available');
      return;
    }

    console.log('ExamLockdown: Chrome APIs available, proceeding...');

    const init = async () => {
      try {
        const lockdown = new ExamLockdown();
        
        if (typeof window !== 'undefined') {
          window.ExamLockdown = lockdown;
        }

        console.log('ExamLockdown: Instance created, waiting for initialization...');

        const start = Date.now();
        while (!lockdown.initialized && !lockdown.initializationError && Date.now() - start < 10000) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (lockdown.initializationError) {
          console.error('Failed to initialize ExamLockdown:', lockdown.initializationError);
        } else {
          console.log('ExamLockdown initialized successfully');
        }
      } catch (error) {
        console.error('Failed to initialize ExamLockdown:', error);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { init().catch(e => console.error(e)); }, { once: true });
    } else {
      setTimeout(() => { init().catch(e => console.error(e)); }, 100);
    }
  } catch (error) {
    console.error('Error in initExamLockdown:', error);
  }
}

try {
  initExamLockdown();
} catch (error) {
  console.error('Failed to start ExamLockdown initialization:', error);
}
