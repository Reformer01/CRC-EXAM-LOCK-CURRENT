'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Search, LayoutDashboard, Heart, BookOpen, BarChart3, Settings, 
  AlertTriangle, Users, Radio, Wifi, RefreshCw, Bell, Plus,
  TrendingUp, Activity, CheckCircle, WifiOff, UserPlus,
  ChevronLeft, ChevronRight, MoreHorizontal, FileText, X,
  FileStack, UserCog, HelpCircle, Lock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { proctoringApi } from '@/lib/data-service'

export default function LiveProctoringPage() {
  const [viewMode, setViewMode] = useState('grid')
  const [severityFilter, setSeverityFilter] = useState('all')
  const pathname = usePathname()

  // Standard navigation matching dashboard
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring', active: true },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const stats = [
    {
      title: 'Students Active',
      value: '1,248',
      change: '+12%',
      icon: Users,
      color: 'text-primary dark:text-blue-400'
    },
    {
      title: 'Critical Alerts',
      value: '14',
      change: 'High Risk',
      icon: AlertTriangle,
      color: 'text-orange-500'
    },
    {
      title: 'Connectivity',
      value: '98.2%',
      change: 'Avg Latency: 42ms',
      subtitle: 'Avg Latency: 42ms',
      icon: Wifi,
      color: 'text-emerald-500'
    }
  ]

  const students = [
    {
      id: 1,
      name: 'Johnathan Doe',
      exam: 'Advanced Physics II',
      status: 'active',
      timeRemaining: '01:42:05',
      flags: 0,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA_aDlmAxE2lq9i7CJxkcF1UuwxUcp6WoWDt4abRslKm1MBj523rVmJyXJQ-JbPHaUvcVNrVAOeI1GqrP-zbhe7qomWIUNBdtnjoPY0b7IKywtWl2CLvcQ4E90tduLtSIlNqadNXrRQaJLBHVzHVlHr7YCCRBlS3XMNRNtc0gX8kCzjFdw7NMqdqd6XiHLl2enjdp4cLB3kP31cScp5FJ76ORnQu27ScIf6t1cWqqKvAiedMRwlORWumoXeNBpr4Ad8QAtvt480Ssz0',
      borderColor: 'border-l-emerald-500'
    },
    {
      id: 2,
      name: 'Sarah Smith',
      exam: 'Ethics & Philosophy',
      status: 'high-risk',
      timeRemaining: '00:24:12',
      flags: 3,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPACPUGz6B7m2J-ZqIPVcwQhSuGTC_Bo_gbSXY9BSHA5u6xUElR9a0UbEBduLxi2PRq0cRcKYblT-M3amo_l7ecdXTb8pUKq-AJB0aH2qDp-KgJkDeqpCBSuV1GfaoBFDs7ygzjuWpQL6Fne5I2lAQsaN_pEZQU49hsKvgxrwlP9D74-vdDHVsKGcE0RoU9oDZnKWvQEfI8ms58q4-W9NbVvXNSI0IpJ2nQ3szrxnDBSRUSDCyBeVduLfens-wH5kRl2Nh938v-dQX',
      borderColor: 'border-l-red-500'
    },
    {
      id: 3,
      name: 'Mike Ross',
      exam: 'Intro to Law',
      status: 'idle',
      timeRemaining: '00:15:00',
      flags: 0,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAAS8OHCn6p6DzKwtF0yONg8mPL-FJxJZikq4qQH_pwlJKxh2UAD7JLZYXWtu2pZUT_Q_mo3_fCn34sgLZpphX1FPMFNx7WCTk8DS1EWkP-vQRpR-sBsuW_hO12JPgoR2AgdlBz-TRhQeVu8Y9EazN_SkwcZyy905ixWYVwxrF36ktTnGk6IkbDT-n1-90WTZJDS26JDK14L2uD8Ttwmu4C79QdmauQpb79q0w3xY7Y3PY7snhy2cDxpVvImHSGdg0X6TPwkndB0M-m',
      borderColor: 'border-l-slate-400'
    },
    {
      id: 4,
      name: 'Elena Gilbert',
      exam: 'Genetics Lab',
      status: 'active',
      timeRemaining: '00:58:30',
      flags: 1,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBDf7Bn5KsaXhSrLHubuazex6kpycGbWVdTijsGOK7hOQ_Sb3GdAt_HMIEfr5aaTI8YVt0EdhilOZyBQztLmhGSxKz_fm0uxzSpIeLtRFFQOoz7gYDaIK0TaZgFXzDvaCH6C5xcJ-uy9DoREmTwyknhqxz0W3DxVMb0MNbmc-4dXK0JZitSKpUW5YUU56-LgzX_OEbl5z66isHSIXumkYeBptCDdZyjyJpUU6bNB-gmfQmS_-XTMv5OD5zTrYdF_wJAmHDQV_mF2TUr',
      borderColor: 'border-l-emerald-500'
    },
    {
      id: 5,
      name: 'Liam Neeson',
      exam: 'Advanced Physics II',
      status: 'reviewing',
      timeRemaining: '01:10:45',
      flags: 5,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBJBywA24qykShxco4Z4w_buRlcvRhUi8EocwkGXz4xjYZ2F1TBPeerJy8tcXjcf-XQHVwOQEbih_8d8TFrIpoTRNUSXDtVznjBANLa5s13yptCscYtu2lYb6sXXi12iszLKSyp66hDsWiwc18Hgb10GFI41HQycl6XugIObg0W_YV1VnA3USFcTxVDYsN5vnm8pbBQHCr-kMWB2sKBsDDRUM4lm-jAmZzbNW3UbYD_l3TR5C-XkHuDBxai9plrEtI6XqKEzMyNFzNZ',
      borderColor: 'border-l-orange-500'
    },
    {
      id: 6,
      name: 'Kevin Spacey',
      exam: 'Ethics & Philosophy',
      status: 'active',
      timeRemaining: '00:44:19',
      flags: 0,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAEBKRz5OT87v7d0D8c90Jb7cCiU84jPKOfEknbg6jTAeJ32qKmFFOLdOKVY_IZwPJ5H8XDaOnWnXqfXKUqCGL-RZfZmYEsRdKnKtEKwngvWz__TvyMzygtVWOcnKdpPlhJy2S8m7orkORjZRn9-ncxq_LRF0GjsgeGkvV_f3n7_Cuwe93EMT0kD-UG9gAhXR8Gym6UWEuS3nqlND7jYdzx8wZgmZ6pi0mkPJNtDmmOHzXGaDa3e8bd4SH0txWYyA1puJmZ4HkOoegg',
      borderColor: 'border-l-emerald-500'
    }
  ]

  const activityFeed = [
    {
      type: 'critical',
      title: 'Critical Flag',
      description: 'Browser focus lost',
      student: 'John Doe',
      time: '2m ago',
      icon: AlertTriangle,
      iconColor: 'bg-red-500'
    },
    {
      type: 'entry',
      title: 'New Entry',
      description: 'Session started: Sarah Smith',
      student: 'Sarah Smith',
      time: '4m ago',
      icon: UserPlus,
      iconColor: 'bg-primary'
    },
    {
      type: 'alert',
      title: 'Connectivity Alert',
      description: 'Low bandwidth detected',
      student: 'Mike Ross',
      time: '5m ago',
      icon: WifiOff,
      iconColor: 'bg-orange-400'
    },
    {
      type: 'complete',
      title: 'Session Complete',
      description: 'Auto-submitted: David G.',
      student: 'David G.',
      time: '12m ago',
      icon: CheckCircle,
      iconColor: 'bg-emerald-500'
    }
  ]

  const getStatusBadge = (status: string, flags: number) => {
    const statusConfig = {
      active: { label: 'Active', color: 'text-emerald-500' },
      'high-risk': { label: 'High Risk', color: 'text-red-500' },
      idle: { label: 'Idle', color: 'text-slate-500' },
      reviewing: { label: 'Reviewing', color: 'text-orange-500' }
    }
    const config = statusConfig[status as keyof typeof statusConfig]
    
    return (
      <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${config.color}`}>
        {status === 'active' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
        {status === 'high-risk' && <AlertTriangle className="h-3 w-3" />}
        {config.label}
      </span>
    )
  }

  const handleBroadcast = async () => {
    const success = await proctoringApi.broadcast('Attention: Please remain focused on your exam.')
    if (success) {
      console.log('Broadcast sent')
    }
  }

  const handleRefresh = async () => {
    console.log('Refreshing data...')
    // In production: reload student data
  }

  const handleMonitor = async (studentId: number) => {
    const success = await proctoringApi.monitor(studentId)
    if (success) {
      console.log('Monitoring student:', studentId)
    }
  }

  const handleIntervene = async (studentId: number) => {
    const success = await proctoringApi.intervene(studentId)
    if (success) {
      console.log('Intervening with student:', studentId)
    }
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
        <div className="layout-container flex h-full grow">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-primary/50 bg-white dark:bg-background-dark flex flex-col justify-between p-4 sticky top-0 h-screen">
            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-3 px-2">
                <div className="text-primary dark:text-slate-100">
                  <Lock className="h-8 w-8" />
                </div>
                <h2 className="text-lg font-bold leading-tight tracking-tight">Exam Lockdown</h2>
              </div>
              <div className="flex flex-col gap-2">
                <div className="px-2 pb-2">
                  <h1 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Proctor Console</h1>
                  <p className="text-xs text-slate-400">Institutional Access</p>
                </div>
                <nav className="flex flex-col gap-1">
                  {navigation.map((item) => (
                    <a
                      key={item.id}
                      href="#"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        item.active
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-primary/20'
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </a>
                  ))}
                </nav>
              </div>
            </div>
            <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-primary/50 pt-4">
              <div className="flex items-center gap-3 px-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full bg-slate-300" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Dr. Julian Vane</span>
                  <span className="text-xs text-slate-400">Chief Proctor</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-slate-200 dark:border-primary/50 px-8 py-4 bg-white/50 dark:bg-background-dark/50 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-6 flex-1">
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search student name, ID or exam..."
                    className="pl-10 pr-4 border-none bg-slate-100 dark:bg-primary/30"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="bg-slate-100 dark:bg-primary/30 border-none text-xs font-medium">
                      <SelectValue placeholder="All Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      <SelectItem value="high">High (Flags)</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button 
                  onClick={handleBroadcast}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg shadow-red-900/20"
                >
                  <Radio className="h-5 w-5" />
                  Broadcast
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-primary/30">
                    <Bell className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-primary/30" onClick={handleRefresh}>
                    <RefreshCw className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </header>

            {/* Content */}
            <div className="p-8 flex flex-col gap-8">
              {/* Stats */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat, index) => (
                  <Card key={index} className="bg-white dark:bg-primary/20 border-slate-200 dark:border-primary/50 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{stat.title}</p>
                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold">{stat.value}</p>
                        <p className={`text-sm font-semibold flex items-center ${
                          stat.change.includes('+') ? 'text-emerald-500' :
                          stat.change.includes('High') ? 'text-orange-500' : 'text-slate-400'
                        }`}>
                          {stat.change.includes('+') && <TrendingUp className="h-4 w-4 mr-1" />}
                          {stat.change}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>

              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                {/* Student Grid */}
                <div className="xl:col-span-3">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold">Live Exam Grid</h3>
                    <div className="flex gap-2">
                      <Button 
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('grid')}
                        className="px-3 py-1 text-xs font-bold"
                      >
                        Grid View
                      </Button>
                      <Button 
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                        className="px-3 py-1 text-xs font-bold"
                      >
                        List View
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {students.map((student) => (
                      <Card 
                        key={student.id} 
                        className={`bg-white dark:bg-primary/20 border-l-4 ${student.borderColor} border-slate-200 dark:border-primary/50 shadow-sm group hover:border-opacity-50 transition-all ${
                          student.status === 'idle' ? 'opacity-80' : ''
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
                                student.status === 'idle' ? 'grayscale' : ''
                              }`}>
                                <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <h4 className={`text-sm font-bold truncate w-32 ${
                                  student.status === 'high-risk' ? 'text-red-500' : ''
                                }`}>{student.name}</h4>
                                <p className="text-[10px] text-slate-400 truncate">{student.exam}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              {getStatusBadge(student.status, student.flags)}
                              <span className="text-[10px] text-slate-500">{student.timeRemaining}</span>
                            </div>
                          </div>
                          <div className="h-8 w-full bg-slate-100 dark:bg-primary/40 rounded flex items-end px-1 pb-1 gap-1">
                            {[...Array(5)].map((_, i) => (
                              <div 
                                key={i}
                                className={`w-full rounded-full ${
                                  student.status === 'high-risk' 
                                    ? i === 1 || i === 2 || i === 4 ? 'bg-red-500' : 'bg-emerald-500/40'
                                    : student.status === 'reviewing'
                                    ? 'bg-orange-500/40'
                                    : student.status === 'idle'
                                    ? 'bg-slate-400/20'
                                    : 'bg-emerald-500/40'
                                }`}
                                style={{ height: `${Math.random() * 20 + 5}px` }}
                              />
                            ))}
                          </div>
                          <div className="mt-3 flex justify-between items-center">
                            <span className={`text-[10px] font-medium ${
                              student.flags > 0 ? 'text-red-500' : 'text-slate-500'
                            }`}>
                              {student.flags} {student.flags === 1 ? 'Flag' : 'Flags'}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => student.status === 'high-risk' ? handleIntervene(student.id) : handleMonitor(student.id)}
                              className={`text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity ${
                                student.status === 'high-risk' ? 'text-red-500' : 'text-primary dark:text-blue-400'
                              }`}
                            >
                              {student.status === 'high-risk' ? 'Intervene' : 'Monitor'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Activity Feed */}
                <div className="xl:col-span-1">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold">Live Activity</h3>
                    <Activity className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex flex-col gap-0 border-l-2 border-slate-200 dark:border-primary/50 ml-3">
                    {activityFeed.map((activity, index) => (
                      <div key={index} className="relative pl-8 pb-6">
                        <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full flex items-center justify-center text-white ring-4 ring-background-light dark:ring-background-dark ${activity.iconColor}`}>
                          <activity.icon className="h-3 w-3" />
                        </div>
                        <Card className="bg-white dark:bg-primary/20 p-3 rounded-lg border-slate-200 dark:border-primary/50 shadow-sm">
                          <p className={`text-xs font-bold mb-1 ${
                            activity.type === 'critical' ? 'text-red-500' :
                            activity.type === 'entry' ? 'text-primary dark:text-slate-200' :
                            activity.type === 'alert' ? 'text-orange-400' :
                            'text-emerald-500'
                          }`}>{activity.title}</p>
                          <p className="text-sm font-medium">{activity.description}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-[10px] text-slate-500">{activity.student} • {activity.time}</span>
                            {activity.type === 'critical' && (
                              <Button variant="link" size="sm" className="text-[10px] font-bold text-primary dark:text-blue-400 underline uppercase p-0 h-auto">
                                Review
                              </Button>
                            )}
                            {activity.type === 'alert' && (
                              <Button variant="link" size="sm" className="text-[10px] font-bold text-primary dark:text-blue-400 underline uppercase p-0 h-auto">
                                View Map
                              </Button>
                            )}
                          </div>
                        </Card>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full mt-6 py-2 border-dashed border-slate-300 dark:border-primary/50 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-primary/10 transition-colors">
                    View Full Audit Log
                  </Button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
