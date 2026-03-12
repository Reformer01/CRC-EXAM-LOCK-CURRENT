'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Search, Bell, Settings, Users, AlertTriangle, Timer,
  Verified, TrendingUp, TrendingDown, Ban, CheckCircle, FileText,
  Trash2, BarChart3, ShieldCheck, Headset, Copyright,
  LayoutDashboard, FileStack, Radio, UserCog, LogOut
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function DashboardPage() {
  const [activityFilter, setActivityFilter] = useState('all')
  const [timeRange, setTimeRange] = useState('24h')
  const pathname = usePathname()

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', active: true },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const metrics = [
    {
      title: 'Active Sessions',
      value: '1,284',
      change: '+12%',
      trend: 'up',
      icon: Users,
      color: 'text-primary',
      subtitle: 'Live Monitoring'
    },
    {
      title: 'Violations Today',
      value: '42',
      change: '-5%',
      trend: 'down',
      icon: AlertTriangle,
      color: 'text-orange-500',
      subtitle: 'Security Events',
      breakdown: { critical: 25, warning: 50, info: 25 }
    },
    {
      title: 'Avg. Duration',
      value: '1h 45m',
      change: '-2%',
      trend: 'neutral',
      icon: Timer,
      color: 'text-blue-500',
      subtitle: 'Stability Index'
    },
    {
      title: 'Clearance Rate',
      value: '98.2%',
      change: '+1%',
      trend: 'up',
      icon: Verified,
      color: 'text-emerald-500',
      subtitle: 'Resolution Health'
    }
  ]

  const activities = [
    {
      id: 1,
      type: 'violation',
      severity: 'critical',
      title: 'Student ID #8842 - Browser Focus Lost',
      description: 'Calculus II Final Exam • Room A-12',
      time: '2 mins ago',
      icon: Ban,
      color: 'bg-rose-500/10 text-rose-500'
    },
    {
      id: 2,
      type: 'cleared',
      severity: 'success',
      title: 'Violation Cleared - Student ID #7721',
      description: 'Cleared by Admin • Network Fluctuations confirmed',
      time: '15 mins ago',
      icon: CheckCircle,
      color: 'bg-emerald-500/10 text-emerald-500'
    },
    {
      id: 3,
      type: 'submission',
      severity: 'info',
      title: 'Successful Submission - Student ID #9021',
      description: 'Intro to Ethics • Time remaining: 12:44',
      time: '24 mins ago',
      icon: FileText,
      color: 'bg-blue-500/10 text-blue-500'
    },
    {
      id: 4,
      type: 'warning',
      severity: 'warning',
      title: 'Warning - Multiple Faces Detected',
      description: 'Student ID #4412 • World History Section C',
      time: '42 mins ago',
      icon: AlertTriangle,
      color: 'bg-orange-500/10 text-orange-500'
    }
  ]

  const quickActions = [
    {
      title: 'Clear Violations',
      description: 'Bulk resolve minor alerts',
      icon: Trash2,
      color: 'text-rose-500 bg-rose-500/10'
    },
    {
      title: 'Generate Report',
      description: 'Daily session summary PDF',
      icon: BarChart3,
      color: 'text-primary bg-primary/10'
    },
    {
      title: 'System Status',
      description: 'All services operational',
      icon: ShieldCheck,
      color: 'text-emerald-500 bg-emerald-500/10'
    }
  ]

  const violationTypes = [
    { name: 'Browser Focus Lost', percentage: 45, color: 'bg-primary' },
    { name: 'Restricted Application Detection', percentage: 28, color: 'bg-orange-500' },
    { name: 'Hardware Access Alert', percentage: 15, color: 'bg-blue-500' },
    { name: 'Multiple Person Detection', percentage: 12, color: 'bg-rose-500' }
  ]

  const hourlyData = [20, 15, 45, 85, 65, 30]

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r bg-background flex flex-col fixed h-screen">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">Exam Lockdown</h1>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          </div>
          <nav className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === item.href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-6 border-t">
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-background px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold tracking-tight">Exam Lockdown Admin</h2>
            </div>
            
            <div className="flex flex-1 justify-end gap-6 items-center">
              {/* Search Bar */}
              <div className="relative min-w-40 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sessions, students, or IDs..."
                  className="pl-10 bg-muted border-muted"
                />
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button variant="outline" size="icon">
                  <Bell className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
              
              {/* User Profile */}
              <div className="flex items-center gap-3 pl-4 border-l">
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold">Admin User</p>
                  <p className="text-[10px] text-muted-foreground">Super Administrator</p>
                </div>
                <div className="bg-primary/20 rounded-full size-9 flex items-center justify-center border border-primary/30 overflow-hidden">
                  <img
                    alt="User profile"
                    className="h-full w-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdCp4_8iljtjat4xgBzkv7KQ7Hu2csI7XCiqgOzGWXlyMQx7Cf1ZnK6eP1NsQfO00fngts7l2LXWGYxpV4tU-wG5WrVNStOc2qNnn0tuywwfK234TV6XUCmXQU_5pqhPZHflVKM4PrPvQTOpa2DI3CVATdGw7V5Syp1pOqwcViae9PMU5qOd2duYDVtzl3kSavmksYkNYh7cjUWDV069U38JBt-l0T_L_c3VLbkor4G1R9UlRe2E1C1esFouSV2Hd1dbEkC0ZKCGUN"
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-[1400px] space-y-8">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((metric, index) => (
                <Card key={index}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                      <metric.icon className={`h-5 w-5 ${metric.color}`} />
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                      <p className="text-3xl font-bold">{metric.value}</p>
                      {metric.trend !== 'neutral' && (
                        <span className={`text-sm font-bold flex items-center ${
                          metric.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {metric.trend === 'up' ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {metric.change}
                        </span>
                      )}
                    </div>
                    {metric.breakdown && (
                      <div className="mt-2">
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="bg-rose-500" style={{ width: `${metric.breakdown.critical}%` }} />
                          <div className="bg-orange-500" style={{ width: `${metric.breakdown.warning}%` }} />
                          <div className="bg-yellow-500" style={{ width: `${metric.breakdown.info}%` }} />
                        </div>
                      </div>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">
                      {metric.subtitle}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Recent Activity */}
              <div className="lg:col-span-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold tracking-tight">Recent Activity</h2>
                  <div className="flex gap-2">
                    {['All', 'Violations', 'Clearances', 'Submissions'].map((filter) => (
                      <Button
                        key={filter}
                        variant={activityFilter === filter.toLowerCase() ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setActivityFilter(filter.toLowerCase())}
                      >
                        {filter}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <Card>
                  <div className="divide-y">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                        <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${activity.color}`}>
                          <activity.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">{activity.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium">{activity.time}</p>
                          <Badge variant="secondary" className={`text-[10px] font-bold ${
                            activity.severity === 'critical' ? 'bg-rose-500/10 text-rose-500' :
                            activity.severity === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                            activity.severity === 'warning' ? 'bg-orange-500/10 text-orange-500' :
                            'bg-blue-500/10 text-blue-500'
                          }`}>
                            {activity.severity.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-muted/30 p-3 text-center">
                    <Button variant="link" className="text-xs font-bold">
                      View All Activity Log
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Quick Actions */}
              <div className="lg:col-span-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {quickActions.map((action, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="w-full justify-start h-auto p-4"
                      >
                        <action.icon className={`mr-3 h-5 w-5 p-2 rounded-lg ${action.color}`} />
                        <div className="text-left">
                          <p className="text-sm font-semibold">{action.title}</p>
                          <p className="text-[10px] text-muted-foreground">{action.description}</p>
                        </div>
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                {/* Live Support Card */}
                <Card className="bg-primary text-primary-foreground border-primary shadow-xl relative overflow-hidden">
                  <CardContent className="p-6">
                    <div className="relative z-10">
                      <h4 className="font-bold text-lg mb-2">Live Session Support</h4>
                      <p className="text-primary-foreground/80 text-sm mb-4">
                        Need immediate help with a locked student account?
                      </p>
                      <Button variant="secondary" className="bg-background text-primary">
                        Contact Proctors
                      </Button>
                    </div>
                    <Headset className="absolute -right-4 -bottom-4 h-28 w-28 text-primary-foreground/5 transform rotate-12" />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Violations Over Time */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Violations Over Time</CardTitle>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">Last 24 Hours</SelectItem>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-end gap-2 w-full px-2">
                    {hourlyData.map((height, index) => (
                      <div
                        key={index}
                        className={`flex-1 rounded-t-sm ${
                          index >= 2 && index <= 4 ? 'bg-primary' : 'bg-muted'
                        }`}
                        style={{ height: `${height}%` }}
                        title={`${index * 4}:00 - ${Math.round(height * 0.67)} violations`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-4 text-[10px] text-muted-foreground font-bold px-2">
                    {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map((time) => (
                      <span key={time}>{time}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Violation Types */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Violation Types</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {violationTypes.map((type, index) => (
                    <div key={index} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">{type.name}</span>
                        <span>{type.percentage}%</span>
                      </div>
                      <div className="w-full bg-muted h-2 rounded-full">
                        <div
                          className={`h-full rounded-full ${type.color}`}
                          style={{ width: `${type.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t bg-background py-6 px-6 mt-auto">
          <div className="mx-auto max-w-[1400px] flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Copyright className="h-4 w-4" />
              <span>2024 Exam Lockdown Pro. All rights reserved.</span>
            </div>
            <div className="flex gap-6 text-sm font-medium text-muted-foreground">
              <Button variant="link" className="h-auto p-0">Privacy Policy</Button>
              <Button variant="link" className="h-auto p-0">Terms of Service</Button>
              <Button variant="link" className="h-auto p-0">Help Center</Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
