// Mock data service for Exam Lockdown Dashboard
// In production, replace these with actual API calls

// Simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

// Types
export interface Exam {
  id: number
  title: string
  courseCode: string
  status: 'active' | 'archived' | 'scheduled'
  scheduledDate: string
  duration: string
  violationProfile: string
}

export interface Admin {
  id: number
  name: string
  email: string
  avatar: string
  role: 'Super Admin' | 'Proctor' | 'Viewer'
  lastLogin: string
}

export interface User {
  id: number
  name: string
  email: string
  studentId: string
  department: string
  totalExams: number
  flagHistory: string
  avatar: string
}

export interface Violation {
  id: string
  timestamp: string
  date: string
  student: {
    name: string
    initials: string
    session: string
  }
  type: string
  typeIcon: string
  severity: 'high' | 'medium' | 'low'
  status: 'pending' | 'resolved'
}

export interface Session {
  id: string
  studentName: string
  email: string
  initials: string
  startTime: string
  duration: string
  status: 'active' | 'completed' | 'disqualified' | 'cleared'
  violations: Array<{ type: string; icon: any }>
  violationCount: number
  isFlagged?: boolean
}

export interface Settings {
  institutionName: string
  timezone: string
  violationLimits: string
  autoSubmitThreshold: string
  lmsEndpoint: string
  webhookSecret: string
}

// Mock Data Stores
let examsData: Exam[] = [
  {
    id: 1,
    title: 'CS101 Final Exam',
    courseCode: 'CS101',
    status: 'active',
    scheduledDate: 'Oct 24, 2023',
    duration: '120 mins',
    violationProfile: 'Standard Lockdown'
  },
  {
    id: 2,
    title: 'MATH201 Midterm',
    courseCode: 'MATH201',
    status: 'scheduled',
    scheduledDate: 'Oct 26, 2023',
    duration: '90 mins',
    violationProfile: 'Standard Lockdown'
  },
  {
    id: 3,
    title: 'ENG105 Quiz 3',
    courseCode: 'ENG105',
    status: 'archived',
    scheduledDate: 'Oct 20, 2023',
    duration: '45 mins',
    violationProfile: 'Light Monitoring'
  }
]

let adminsData: Admin[] = [
  {
    id: 1,
    name: 'Alex Rivera',
    email: 'alex.r@institution.edu',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDHcCjtyY4Jl-m5Rap84cY67Zyd-W_CFuRfKO8XLAmEm2VJNKNnKOPxcDNetOQZtqL5XyUOav_G8dnx3lUhy2O8uYgryb_dpzPgRmQFAL5ieD5eYDCl8YSaq2bgYqznV8qilsTdg4mjpIuyndqJq7fjmnbcr8021EDXiJ69qTsMg61lFZlFRnRMAHQ3s9CHSd3y90Wi54Jf8gLdFbZFBsaBfEivLhBxs9FLQmfUiD4hurWw-ohATkWNEANiO-KOYjIirNv7sf83DoW5',
    role: 'Super Admin',
    lastLogin: '2 hours ago'
  },
  {
    id: 2,
    name: 'Sarah Chen',
    email: 's.chen@institution.edu',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCF1N9ygD-lXm55HmByKBV-yHMr9h0z8zK5zRIRWXMRlE6OaMiisg_P2wjixxaONiFlITaiYtnCh4c4XRDwWnO5-DtPM10iyfXmAoMFQ8QFkqnJo2ZPDvEKAaMRPtmp-MfnZ9Pw1FDw0FGfIwtOpErvjkGl_cjOs6i0J26045Ofa_SVh_pA964rbx_OMjkqEFVTRGeV0uJB4JlZ7O2HXOq6eDOq8efaGKgU1lC8My_eA6F_siAL19QAdgyZEnD0KKVS94vBsBd-_iSH',
    role: 'Proctor',
    lastLogin: 'Yesterday, 14:20'
  },
  {
    id: 3,
    name: 'James Wilson',
    email: 'j.wilson@institution.edu',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAaOVBcLDFQ3PpFDQI1G6VQIdZ8-acTNBTbf4cZdCM2dbMVGJkS7D8BwAttivrmQgtHAiAb98736NHrHTBThQWmUwXMtlqJm8JEqHAq25pK9QAh5JCg3qCFKn4v7VPo21zrPn6FZ_DkFmjOiAAUBtEKdlhMrs3lTf3B43Dg-0k7iNh-0YucdL2HSVZ8XANuDZ7VDrnCKvB6xw-7MoMKhzX65K4pZX89EG0SUxUzDsllmAX4sUckSmxNw8pg8p1kC_TxPqeM65Z8V275',
    role: 'Viewer',
    lastLogin: '3 days ago'
  },
  {
    id: 4,
    name: 'Elena Rodriguez',
    email: 'elena.rod@institution.edu',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBN6B6XO3MoNQa1G7bzaMdCuQGppM69FB3CVh_6_cmFDfc2w2eAH_e5ThyG8ovfe-zIMdGx5-v9BGgNOUi7HJmiz2-I7UKWqp_t3gY_Nz_WHCLj7NbKBju5FxBhT8WepJcXYR26OPO2CKkMUxP43olDVP86xIvMbsxn71WH1Nf1Rv17a1tBHuBhJDDyL7ZUDx--cMRjDg40l51JKhwumt9qypxaP0tcDoZRPj-ODN2ZEhGtFd4zCY2oFzUxlrW3v58AkDOJPRSnBntp',
    role: 'Proctor',
    lastLogin: 'Oct 12, 2023'
  }
]

let usersData: User[] = [
  {
    id: 1,
    name: 'James Wilson',
    email: 'j.wilson@university.edu',
    studentId: '#STU-94021',
    department: 'Computer Science',
    totalExams: 12,
    flagHistory: '0 / 10',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBDdNnniKiIAA16YvwJyO_q0cCjIjem1A4FEZxZOtWS2Sj2wj3841BfHPWaYBCi7BzyX4GAgxpE_1Ip1CWZiYQvDLRj8t3HtvT86L2MaeRC3NlIhEwFLtEqUcJq6se3aLgW-GSDDdURNO7sI0U-ObKUKao__wQRlPJd9i4y6RFeqK1LWW7LIgJkk-yxxpSnew_aTTxX5K22dUp1QVhULOjxiC4GKOPE7VncZIsBPDAOwkecWZ4C0Qo5Vlk8x7CAkKXSWX0gASLqRyxF'
  },
  {
    id: 2,
    name: 'Sarah Chen',
    email: 's.chen@university.edu',
    studentId: '#STU-88231',
    department: 'Digital Arts',
    totalExams: 8,
    flagHistory: '3 / 10',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBkcTA7H4HcfG75KHRMjlXL0hU0kAp1gbNtu03UnVw4TsCpSfBMVXbSb6BYSA2oL1bE_vAQOhtAcj6SfjwMGzay-hSO4cLratzJbWfB9F_IDIJm53niTipz2yRPnipkI1YwZQVjzG34xjJSiOzU9VAyXSUgu6CnF4BsVAELCj-WcQ-gj0bt2DWkyVGbMrg7CmYe2vhAZ4KcTy97g4nJvrfQ9Tc0B8fuTIjKuYiC8rscQihT6WWtw6Mr8g1yDDg1PvRaf8cBjLBJqugX'
  }
]

let settingsData: Settings = {
  institutionName: 'Global Institute of Technology',
  timezone: 'GMT',
  violationLimits: '3',
  autoSubmitThreshold: '5',
  lmsEndpoint: 'https://api.canvas-lms.edu/v1/webhooks/lockdown',
  webhookSecret: '••••••••••••••••••••••••••••'
}

// Exams API
export const examsApi = {
  getAll: async (): Promise<Exam[]> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return [...examsData]
  },

  getById: async (id: number): Promise<Exam | undefined> => {
    await new Promise(resolve => setTimeout(resolve, 200))
    return examsData.find(e => e.id === id)
  },

  create: async (exam: Omit<Exam, 'id'>): Promise<Exam> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const newExam = { ...exam, id: Math.max(...examsData.map(e => e.id), 0) + 1 }
    examsData.push(newExam)
    return newExam
  },

  update: async (id: number, updates: Partial<Exam>): Promise<Exam | undefined> => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const index = examsData.findIndex(e => e.id === id)
    if (index === -1) return undefined
    examsData[index] = { ...examsData[index], ...updates }
    return examsData[index]
  },

  delete: async (id: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    const index = examsData.findIndex(e => e.id === id)
    if (index === -1) return false
    examsData.splice(index, 1)
    return true
  },

  archive: async (id: number): Promise<Exam | undefined> => {
    return examsApi.update(id, { status: 'archived' })
  },

  duplicate: async (id: number): Promise<Exam | undefined> => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const original = examsData.find(e => e.id === id)
    if (!original) return undefined
    const duplicate = { ...original, id: Math.max(...examsData.map(e => e.id), 0) + 1, title: `${original.title} (Copy)` }
    examsData.push(duplicate)
    return duplicate
  }
}

// Admins API
export const adminsApi = {
  getAll: async (): Promise<Admin[]> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return [...adminsData]
  },

  invite: async (admin: Omit<Admin, 'id' | 'lastLogin'>): Promise<Admin> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const newAdmin = { ...admin, id: Math.max(...adminsData.map(a => a.id), 0) + 1, lastLogin: 'Just now' }
    adminsData.push(newAdmin)
    return newAdmin
  },

  update: async (id: number, updates: Partial<Admin>): Promise<Admin | undefined> => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const index = adminsData.findIndex(a => a.id === id)
    if (index === -1) return undefined
    adminsData[index] = { ...adminsData[index], ...updates }
    return adminsData[index]
  },

  remove: async (id: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    const index = adminsData.findIndex(a => a.id === id)
    if (index === -1) return false
    adminsData.splice(index, 1)
    return true
  }
}

// Users API
export const usersApi = {
  getAll: async (): Promise<User[]> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return [...usersData]
  },

  importCSV: async (csvData: string): Promise<{ success: number; failed: number }> => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    // Mock CSV import - in real app, parse CSV and add users
    return { success: 5, failed: 0 }
  },

  addUser: async (user: Omit<User, 'id'>): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const newUser = { ...user, id: Math.max(...usersData.map(u => u.id), 0) + 1 }
    usersData.push(newUser)
    return newUser
  },

  viewProfile: async (id: number): Promise<User | undefined> => {
    await new Promise(resolve => setTimeout(resolve, 200))
    return usersData.find(u => u.id === id)
  },

  resetMFA: async (id: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const user = usersData.find(u => u.id === id)
    if (!user) return false
    // In real app, reset MFA credentials
    return true
  },

  deactivate: async (id: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    const index = usersData.findIndex(u => u.id === id)
    if (index === -1) return false
    // In real app, mark user as inactive
    return true
  }
}

// Settings API
export const settingsApi = {
  get: async (): Promise<Settings> => {
    await new Promise(resolve => setTimeout(resolve, 200))
    return { ...settingsData }
  },

  save: async (settings: Settings): Promise<Settings> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    settingsData = { ...settings }
    return settingsData
  },

  regenerateSecret: async (): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 800))
    const newSecret = 'sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    settingsData.webhookSecret = newSecret
    return newSecret
  }
}

// Violations API
export const violationsApi = {
  approve: async (id: string): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    // In real app, update violation status to resolved
    return true
  },

  reject: async (id: string): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    // In real app, update violation status
    return true
  },

  bulkApprove: async (ids: string[]): Promise<number> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return ids.length
  },

  export: async (format: 'pdf' | 'csv' | 'xlsx'): Promise<Blob> => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    // Return mock blob
    return new Blob(['mock data'], { type: 'text/plain' })
  }
}

// Live Proctoring API
export const proctoringApi = {
  broadcast: async (message: string): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 400))
    // In real app, send message to all active sessions
    return true
  },

  intervene: async (studentId: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    // In real app, flag session for proctor intervention
    return true
  },

  monitor: async (studentId: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 200))
    // In real app, open detailed monitoring view
    return true
  }
}

// Reports API
export const reportsApi = {
  generate: async (type: string, dateRange: string, format: string): Promise<Blob> => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    return new Blob(['mock report data'], { type: 'application/pdf' })
  }
}

// Analytics API
export const analyticsApi = {
  getStats: async (): Promise<{ activeSessions: number; violationsToday: number; avgDuration: string; clearanceRate: string }> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return {
      activeSessions: 1284,
      violationsToday: 42,
      avgDuration: '1h 45m',
      clearanceRate: '98.2%'
    }
  },

  getViolationTypes: async (): Promise<Array<{ name: string; percentage: number }>> => {
    await new Promise(resolve => setTimeout(resolve, 200))
    return [
      { name: 'Multiple Faces', percentage: 42 },
      { name: 'Tab Switching', percentage: 28 },
      { name: 'No Face Detected', percentage: 15 },
      { name: 'Hardware Access', percentage: 15 }
    ]
  }
}
