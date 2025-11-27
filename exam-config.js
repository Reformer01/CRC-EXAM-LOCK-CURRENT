const EXAM_CONFIG = {
  EXAM_DURATION: null,
  WARNING_TIME: null,
  FINAL_WARNING_TIME: null,
  
  LOCKOUT_MESSAGE: "Time's up! Your exam has been locked. Please contact your instructor.",
  
  TIMER_POSITION: 'top-right',
  TIMER_STYLE: {
    backgroundColor: '#1a73e8',
    color: 'white',
    padding: '10px 15px',
    borderRadius: '5px',
    fontSize: '16px',
    fontWeight: 'bold',
    zIndex: 9999,
    position: 'fixed',
    top: '20px',
    right: '20px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
  },
  
  MAX_VIOLATIONS: 4,
  VIOLATION_COOLDOWNS: {
    'visibilitychange': 1500,
    'window-blur': 1500,
    'keyboard': 1500,
    'mouse': 1500,
    'clipboard': 1500,
    'devtools': 1500,
    'time_exceeded': 0
  },
  
  STORAGE_KEYS: {
    SESSION: 'examSession',
    START_TIME: 'examStartTime',
    VIOLATIONS: 'examViolations',
    LOCKED: 'examLocked',
    TIMER_STATE: 'timerState'
  },
  
  ADMIN_EMAIL: "reformer.ejembi@iworldnetworks.net",
  GOOGLE_SHEETS_WEBHOOK: "https://script.google.com/macros/s/AKfycbxKQ6uSav6EqA97vRTao6ZnElUO_6MiaH0G9xLgqOeNMVVD-5RNUkF95X5FaVvFPwilcw/exec",
  
  RULES: {
    ALLOW_TAB_SWITCHING: false,
    ALLOW_WINDOW_BLUR: false,
    ALLOW_COPY_PASTE: false,
    ALLOW_DEVTOOLS: false,
    ALLOW_KEYBOARD_SHORTCUTS: false
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EXAM_CONFIG;
} else if (typeof window !== 'undefined') {
  window.EXAM_CONFIG = EXAM_CONFIG;
}
