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
      this.fullscreenMonitorInterval = null;
      this.periodicUrlCheckInterval = null;
      this.storageArea = null;
      this.storageUnavailable = false;
      this.runtimeInvalidated = false;
      this.runtimeInvalidatedLogged = false;
      this.identityWarningLogged = false;
      this.lastKnownUrl = window.location.href;
      this.lastFormUrl = '';
      this.lastDetectedUrl = '';
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
      setTimeout(async () => {
        this.initComponents();
        this.setupEventListeners();
        this.initialized = true;
        // Initialize exam after basic setup is complete
        await this.initializeExam();
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
      this.setupViolationListeners(); // Add violation detection
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
      
      // Also monitor DOM changes that might indicate section navigation
      const observer = new MutationObserver((mutations) => {
        if (this.isExamStarted) {
          // Check if URL actually changed
          const currentUrl = this.getCurrentFormUrl();
          if (currentUrl !== this.lastDetectedUrl) {
            console.log('[ExamLockdown] DOM-based URL change detected:', currentUrl);
            this.lastDetectedUrl = currentUrl;
            this.handleUrlChange();
          }
        }
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false,
        characterData: false
      });
      
      this.eventListeners.push(() => observer.disconnect());
      
      // Add periodic URL checking as fallback for Google Forms
      this.startPeriodicUrlCheck();
      
    } catch (error) {
      console.error('Error setting up URL change listener:', error);
    }
  }

  setupViolationListeners() {
    try {
      // Visibility change detection (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.isExamStarted && !this.examSubmitted) {
          this.handleViolation('visibilitychange');
        }
      });

      // Window focus/blur detection
      window.addEventListener('blur', () => {
        if (this.isExamStarted && !this.examSubmitted) {
          this.handleViolation('window-blur');
        }
      });

      window.addEventListener('focus', () => {
        // Log when focus returns (for debugging)
        if (this.isExamStarted) {
          console.log('[ExamLockdown] Window focus regained');
        }
      });

      // Keyboard shortcuts detection
      document.addEventListener('keydown', (e) => {
        if (!this.isExamStarted || this.examSubmitted) return;
        
        // Detect common forbidden shortcuts
        const forbiddenKeys = [
          // Basic shortcuts
          { ctrl: true, key: 'c', desc: 'copy' },
          { ctrl: true, key: 'v', desc: 'paste' },
          { ctrl: true, key: 'x', desc: 'cut' },
          { ctrl: true, key: 'u', desc: 'view-source' },
          
          // DevTools shortcuts
          { ctrl: true, shift: true, key: 'i', desc: 'devtools' },
          { ctrl: true, shift: true, key: 'j', desc: 'devtools' },
          { ctrl: true, shift: true, key: 'c', desc: 'devtools' },
          { key: 'F12', desc: 'devtools' },
          
          // Tab switching and window management
          { ctrl: true, key: 'Tab', desc: 'tab-switch' },
          { ctrl: true, key: 'PageUp', desc: 'tab-switch' },
          { ctrl: true, key: 'PageDown', desc: 'tab-switch' },
          { ctrl: true, key: '1', desc: 'tab-switch' },
          { ctrl: true, key: '2', desc: 'tab-switch' },
          { ctrl: true, key: '3', desc: 'tab-switch' },
          { ctrl: true, key: '4', desc: 'tab-switch' },
          { ctrl: true, key: '5', desc: 'tab-switch' },
          { ctrl: true, key: '6', desc: 'tab-switch' },
          { ctrl: true, key: '7', desc: 'tab-switch' },
          { ctrl: true, key: '8', desc: 'tab-switch' },
          { ctrl: true, key: '9', desc: 'tab-switch' },
          { ctrl: true, key: '0', desc: 'tab-switch' },
          
          // Alt+Tab combinations (window switching)
          { alt: true, key: 'Tab', desc: 'window-switch' },
          { alt: true, key: 'Escape', desc: 'window-switch' },
          { alt: true, key: 'F4', desc: 'window-close' },
          
          // Windows key combinations
          { meta: true, key: 'Tab', desc: 'window-switch' },
          { meta: true, key: 'Escape', desc: 'window-switch' },
          { meta: true, shift: true, key: 'Tab', desc: 'window-switch' },
          { meta: true, key: 'ArrowLeft', desc: 'window-switch' },
          { meta: true, key: 'ArrowRight', desc: 'window-switch' },
          { meta: true, key: 'ArrowUp', desc: 'window-switch' },
          { meta: true, key: 'ArrowDown', desc: 'window-switch' },
          
          // Task Manager and System shortcuts
          { ctrl: true, shift: true, key: 'Escape', desc: 'task-manager' },
          { ctrl: true, alt: true, key: 'Delete', desc: 'task-manager' },
          { meta: true, shift: true, key: 'Escape', desc: 'task-manager' },
          
          // Function keys that might open system tools
          { key: 'F1', desc: 'help' },
          { key: 'F3', desc: 'search' },
          { key: 'F5', desc: 'refresh' },
          { key: 'F6', desc: 'address-bar' },
          { key: 'F7', desc: 'caret-browsing' },
          { key: 'F10', desc: 'menu' },
          { key: 'F11', desc: 'fullscreen-toggle' },
          
          // Browser-specific shortcuts
          { ctrl: true, key: 'h', desc: 'history' },
          { ctrl: true, key: 'j', desc: 'downloads' },
          { ctrl: true, key: 'l', desc: 'address-bar' },
          { ctrl: true, key: 'n', desc: 'new-window' },
          { ctrl: true, key: 't', desc: 'new-tab' },
          { ctrl: true, key: 'w', desc: 'close-tab' },
          { ctrl: true, key: 'q', desc: 'quit' },
          { ctrl: true, shift: true, key: 't', desc: 'new-tab' },
          { ctrl: true, shift: true, key: 'n', desc: 'new-window' },
          { ctrl: true, shift: true, key: 'w', desc: 'close-window' },
          
          // Alt key combinations
          { alt: true, key: 'ArrowLeft', desc: 'back' },
          { alt: true, key: 'ArrowRight', desc: 'forward' },
          { alt: true, key: 'ArrowUp', desc: 'scroll-up' },
          { alt: true, key: 'ArrowDown', desc: 'scroll-down' },
          { alt: true, key: 'Home', desc: 'home' },
          
          // Shift+Alt combinations
          { shift: true, alt: true, key: 'Tab', desc: 'window-switch' },
          { shift: true, alt: true, key: 'Escape', desc: 'window-switch' }
        ];

        const isForbidden = forbiddenKeys.some(shortcut => {
          if (shortcut.ctrl && !e.ctrlKey) return false;
          if (shortcut.shift && !e.shiftKey) return false;
          if (shortcut.alt && !e.altKey) return false;
          if (shortcut.meta && !e.metaKey) return false; // meta is Windows/Cmd key
          if (shortcut.key === e.key) return true;
          return false;
        });

        // Also block Tab key completely during exam (except in input fields)
        const isTabKey = e.key === 'Tab';
        const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true';
        
        if (isForbidden || (isTabKey && !isInInput)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          // Log the specific violation type
          const violationType = isTabKey ? 'tab-navigation' : 'keyboard';
          console.log('[ExamLockdown] Blocked keyboard shortcut:', e.key, e.ctrlKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.metaKey ? 'Meta' : '');
          
          this.handleViolation(violationType);
          
          // Show immediate warning for serious violations
          const matchedShortcut = forbiddenKeys.find(shortcut => {
            if (shortcut.ctrl && !e.ctrlKey) return false;
            if (shortcut.shift && !e.shiftKey) return false;
            if (shortcut.alt && !e.altKey) return false;
            if (shortcut.meta && !e.metaKey) return false;
            if (shortcut.key === e.key) return true;
            return false;
          });
          
          if (matchedShortcut?.desc === 'window-switch' || matchedShortcut?.desc === 'task-manager' || isTabKey) {
            this.showImmediateWarning('Window/tab switching is not allowed during exam!');
          }
        }
      });

      // Mouse movement detection (outside window)
      document.addEventListener('mouseleave', () => {
        if (this.isExamStarted && !this.examSubmitted) {
          this.handleViolation('mouse');
        }
      });

      // Clipboard detection
      document.addEventListener('copy', (e) => {
        if (this.isExamStarted && !this.examSubmitted) {
          e.preventDefault();
          this.handleViolation('clipboard');
        }
      });

      document.addEventListener('paste', (e) => {
        if (this.isExamStarted && !this.examSubmitted) {
          e.preventDefault();
          this.handleViolation('clipboard');
        }
      });

      // Devtools detection
      const devtoolsDetector = () => {
        if (this.isExamStarted && !this.examSubmitted) {
          const threshold = 160;
          if (window.outerHeight - window.innerHeight > threshold || 
              window.outerWidth - window.innerWidth > threshold) {
            this.handleViolation('devtools');
          }
        }
      };

      window.addEventListener('resize', devtoolsDetector);
      this.eventListeners.push(() => window.removeEventListener('resize', devtoolsDetector));

      console.log('[ExamLockdown] Violation detection listeners set up');
    } catch (error) {
      console.error('Error setting up violation listeners:', error);
    }
  }

  handleUrlChange() {
    try {
      if (this.initialized && !this.runtimeInvalidated) {
        // Check if this is the same form (multi-section navigation)
        const currentFormUrl = this.getCurrentFormUrl();
        const previousFormUrl = this.lastFormUrl || '';
        
        // Update last detected URL
        this.lastDetectedUrl = currentFormUrl;
        
        console.log('[ExamLockdown] URL change detected:', {
          currentFormUrl,
          previousFormUrl,
          isExamStarted: this.isExamStarted,
          examSubmitted: this.examSubmitted
        });
        
        // If the base form URL is the same, this is just section navigation
        if (currentFormUrl === previousFormUrl && this.isExamStarted) {
          console.log('[ExamLockdown] Multi-section navigation detected, re-establishing monitoring');
          
          // Show an overlay to indicate section change and maintain monitoring
          this.showSectionChangeOverlay();
          
          // Re-attach all listeners for new DOM content
          console.log('[ExamLockdown] Re-attaching form submission listeners');
          this.setupFormSubmissionListeners();
          
          console.log('[ExamLockdown] Re-attaching fullscreen listener');
          this.setupFullscreenListener();
          
          // Restart monitoring if needed
          console.log('[ExamLockdown] Restarting monitoring systems');
          this.restartMonitoring();
          
          // Ensure violation detection is active
          if (!this.violationClearCheckInterval) {
            console.log('[ExamLockdown] Starting violation clear check');
            this.startViolationClearCheck();
          }
          
          return;
        }
        
        // Otherwise, treat as new form initialization
        console.log('[ExamLockdown] New form detected, initializing exam');
        this.initializeExam();
      }
    } catch (error) {
      console.error('Error handling URL change:', error);
    }
  }

  showImmediateWarning(message) {
    try {
      if (this.currentOverlay) return; // Don't show if overlay already exists

      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay immediate-warning';
      overlay.innerHTML = `
        <div class="exam-overlay-content warning-content">
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <h2>⚠️ Exam Violation Detected!</h2>
          <p>${message}</p>
          <p class="violation-count">Total Violations: ${this.violationCount}</p>
          <button class="exam-button" onclick="this.closest('.exam-overlay').remove()">I Understand</button>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      // Auto-remove after 2 seconds
      setTimeout(() => {
        if (overlay.parentElement) {
          overlay.remove();
          this.currentOverlay = null;
        }
      }, 2000);

    } catch (error) {
      console.error('Error showing immediate warning:', error);
    }
  }

  restartMonitoring() {
    try {
      // Restart violation clear checks (this method exists)
      this.clearViolationClearCheck();
      this.startViolationClearCheck();
      
      // Re-attach violation listeners for new DOM content
      console.log('[ExamLockdown] Re-attaching violation listeners');
      this.setupViolationListeners();
      
      // Start aggressive fullscreen monitoring for multi-section forms
      this.startFullscreenMonitoring();
      
      console.log('[ExamLockdown] Monitoring restarted after section navigation');
    } catch (error) {
      console.error('Error restarting monitoring:', error);
    }
  }

  startFullscreenMonitoring() {
    // Clear any existing fullscreen monitoring
    if (this.fullscreenMonitorInterval) {
      clearInterval(this.fullscreenMonitorInterval);
    }
    
    // Check fullscreen every 500ms for the first 10 seconds after navigation
    let checks = 0;
    this.fullscreenMonitorInterval = setInterval(() => {
      checks++;
      if (!document.fullscreenElement && this.isExamStarted && !this.examSubmitted) {
        console.log('[ExamLockdown] Fullscreen lost during section navigation - showing warning');
        // Show fullscreen warning instead of trying to force fullscreen
        this.showFullscreenWarning();
      }
      
      // Stop after 10 seconds (20 checks)
      if (checks >= 20) {
        clearInterval(this.fullscreenMonitorInterval);
        this.fullscreenMonitorInterval = null;
      }
    }, 500);
  }

  startPeriodicUrlCheck() {
    // Clear any existing periodic check
    if (this.periodicUrlCheckInterval) {
      clearInterval(this.periodicUrlCheckInterval);
    }
    
    // Check URL every 2 seconds when exam is active
    this.periodicUrlCheckInterval = setInterval(() => {
      if (this.isExamStarted && !this.examSubmitted) {
        const currentUrl = this.getCurrentFormUrl();
        const currentFullUrl = window.location.href;
        
        // Check if the full URL changed (including query params)
        if (currentFullUrl !== this.lastKnownUrl) {
          console.log('[ExamLockdown] Periodic URL change detected:', currentFullUrl);
          this.lastKnownUrl = currentFullUrl;
          
          // Always handle URL change during exam to re-establish monitoring
          this.handleUrlChange();
        }
      }
    }, 2000);
  }

  showSectionChangeOverlay() {
    try {
      if (this.currentOverlay) return; // Don't show if overlay already exists

      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      
      // Check if fullscreen is active
      const isFullscreen = document.fullscreenElement !== null;
      const fullscreenStatus = isFullscreen ? 'Active' : 'Lost - Please re-enter fullscreen';
      const fullscreenClass = isFullscreen ? 'success' : 'warning';
      
      overlay.innerHTML = `
        <div class="exam-overlay-content lockout-content">
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
            </svg>
          </div>
          <h2>Section Changed</h2>
          <p>You've moved to a new section of the exam.</p>
          <p>Exam monitoring is being maintained.</p>
          
          <div class="exam-info">
            <p><strong>Student:</strong> ${this.studentName}</p>
            <p><strong>Violations:</strong> ${this.violationCount}</p>
            <p><strong>Status:</strong> Exam in progress</p>
            <p class="${fullscreenClass}"><strong>Fullscreen:</strong> ${fullscreenStatus}</p>
          </div>
          
          ${!isFullscreen ? `
            <div class="fullscreen-prompt">
              <p class="warning-text">⚠️ Fullscreen mode is required!</p>
              <button class="exam-button primary" onclick="document.documentElement.requestFullscreen(); this.closest('.exam-overlay').remove();">
                Enter Fullscreen
              </button>
            </div>
          ` : ''}
          
          <button class="exam-button" onclick="this.closest('.exam-overlay').remove()">Continue</button>
        </div>
      `;

      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      // Only auto-remove if fullscreen is active, otherwise keep it visible
      if (isFullscreen) {
        setTimeout(() => {
          if (overlay.parentElement) {
            overlay.remove();
            this.currentOverlay = null;
          }
        }, 3000);
      } else {
        // Don't auto-remove if fullscreen is lost - user must take action
        console.log('[ExamLockdown] Fullscreen lost, keeping overlay visible until user takes action');
      }

    } catch (error) {
      console.error('Error showing section change overlay:', error);
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
            'devtools': 1500,
            'tab-navigation': 1000,
            'window-switch': 500,
            'task-manager': 500
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
    // Remove query parameters for multi-section forms to treat them as the same form
    let pathname = urlObj.pathname;
    const baseUrl = pathname.replace(/\/page\/\d+$/, ''); // Remove /page/N from URLs
    
    // Also remove any hash fragments that might indicate sections
    const cleanUrl = baseUrl.replace(/#.*$/, '');
    
    return cleanUrl;
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
      'time_exceeded': 'high',
      'tab-navigation': 'high',
      'window-switch': 'critical',
      'task-manager': 'critical'
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
            mode: 'no-cors', // Add no-cors mode to handle CORS issues
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'logViolation',
              violationData: {
                ...violationData,
                timestamp: new Date().toISOString()
              }
            })
          });

          // With no-cors mode, we can't check response.ok, so just log success
          console.log('Violation logged via webhook (no-cors mode)');
        } catch (err) {
          console.warn('Direct webhook violation logging failed:', err);
          // Don't throw error, just log it - extension should continue working
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
        'devtools': '🚨 CRITICAL: Developer tools opened!',
        'tab-navigation': '🚨 CRITICAL: Tab navigation blocked!',
        'window-switch': '🚨 CRITICAL: Window switching blocked!',
        'task-manager': '🚨 CRITICAL: Task Manager access blocked!'
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
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h2>Exam Lockdown</h2>
          <p>Please enter your name to begin the exam.</p>
          <div class="input-group">
            <input type="text" id="student-name-input" placeholder="Enter your full name" maxlength="100">
          </div>
          <div class="exam-rules">
            <h3>Exam Rules:</h3>
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
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h2>Exam Already Submitted</h2>
          <p>This exam has already been submitted. You must wait 60 minutes before retaking it.</p>
          <div class="countdown-container">
            <div class="countdown-timer" id="countdown-timer">--:--</div>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
          <div class="continue-section" id="continue-section" style="display: none;">
            <p>You can now retake the exam!</p>
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
      this.lastFormUrl = this.getCurrentFormUrl(); // Track form URL for multi-section detection
      
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
        <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
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
        <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
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
            mode: 'no-cors', // Add no-cors mode to handle CORS issues
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'logViolation',
              violationData: {
                ...violationData,
                timestamp: new Date().toISOString()
              }
            })
          });

          // With no-cors mode, we can't check response.ok or get response data
          console.log('Violation logged via webhook (no-cors mode)');
          return { success: true };
        } catch (err) {
          console.warn('Direct webhook violation logging failed:', err);
          // Don't throw error, return success so extension continues working
          return { success: false, error: err.message };
        }
      }
    } catch (error) {
      console.error('Error logging violation:', error);
      // Don't throw error - extension should continue working even if logging fails
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
      'time_exceeded': 'high',
      'tab-navigation': 'high',
      'window-switch': 'critical',
      'task-manager': 'critical'
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
        'devtools': '🚨 CRITICAL: Developer tools opened!',
        'tab-navigation': '🚨 CRITICAL: Tab navigation blocked!',
        'window-switch': '🚨 CRITICAL: Window switching blocked!',
        'task-manager': '🚨 CRITICAL: Task Manager access blocked!'
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
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h2>Exam Lockdown</h2>
          <p>Please enter your name to begin the exam.</p>
          <div class="input-group">
            <input type="text" id="student-name-input" placeholder="Enter your full name" maxlength="100">
          </div>
          <div class="exam-rules">
            <h3>Exam Rules:</h3>
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
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h2>Exam Already Submitted</h2>
          <p>This exam has already been submitted. You must wait 60 minutes before retaking it.</p>
          <div class="countdown-container">
            <div class="countdown-timer" id="countdown-timer">--:--</div>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
          <div class="continue-section" id="continue-section" style="display: none;">
            <p>You can now retake the exam!</p>
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
      this.lastFormUrl = this.getCurrentFormUrl(); // Track form URL for multi-section detection
      
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

  async requestFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error('Error requesting fullscreen:', error);
      this.showNotification('Failed to enter fullscreen. Please try again.', 'error');
    }
  }

  showFullscreenWarning() {
    try {
      if (this.currentOverlay) return;

      const overlay = document.createElement('div');
      overlay.className = 'exam-overlay';
      overlay.innerHTML = `
        <div class="exam-overlay-content warning-content">
          <div class="exam-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
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
            const submitButton = e.target.closest('button[type="submit"], div[role="button"][aria-label*="Submit"], div[role="button"][data-tooltip*="Submit"], span[data-tooltip*="Submit"]');
            const nextButton = e.target.closest('div[role="button"][aria-label*="Next"], div[role="button"][data-tooltip*="Next"], span[data-tooltip*="Next"]');
            
            if (submitButton) {
              this.submissionInProgress = true;
              setTimeout(() => { this.submissionInProgress = false; }, 5000);
            } else if (nextButton) {
              // Handle Next button clicks for multi-section forms
              console.log('[ExamLockdown] Next button clicked, maintaining exam state');
              // Don't set submissionInProgress for navigation buttons
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
      if (this.fullscreenMonitorInterval) {
        clearInterval(this.fullscreenMonitorInterval);
        this.fullscreenMonitorInterval = null;
      }
      if (this.periodicUrlCheckInterval) {
        clearInterval(this.periodicUrlCheckInterval);
        this.periodicUrlCheckInterval = null;
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
    if (!areChromeApisAvailable()) {
      console.error('Exam Lockdown: Required Chrome extension APIs are not available');
      return;
    }

    const init = async () => {
      try {
        const lockdown = new ExamLockdown();
        
        if (typeof window !== 'undefined') {
          window.ExamLockdown = lockdown;
        }

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
