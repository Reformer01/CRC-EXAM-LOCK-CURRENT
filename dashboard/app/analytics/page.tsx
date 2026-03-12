'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, LayoutDashboard, FileText, Video, BarChart3, Bell, FileText as Description,
  Calendar, Settings, Download, MoreHorizontal, Plus, TrendingUp, PieChart,
  BarChart as BarChartIcon, Clock, Users, FileText as FileTextIcon, Search,
  AlertTriangle, Radio, FileStack, UserCog, HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { reportsApi, analyticsApi } from '@/lib/data-service'

export default function ReportsAnalyticsPage() {
  const [reportType, setReportType] = useState('session-summary')
  const [dateRange, setDateRange] = useState('Oct 1, 2023 - Oct 31, 2023')
  const [format, setFormat] = useState('pdf')
  const [stats, setStats] = useState({
    activeSessions: 1284,
    violationsToday: 42,
    avgDuration: '1h 45m',
    clearanceRate: '98.2%'
  })
  const [violationTypes, setViolationTypes] = useState([
    { name: 'Multiple Faces', percentage: 42, color: 'bg-accent' },
    { name: 'Tab Switching', percentage: 28, color: 'bg-primary' },
    { name: 'No Face Detected', percentage: 15, color: 'bg-slate-500' }
  ])
  const pathname = usePathname()

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const statsData = await analyticsApi.getStats()
      const violationData = await analyticsApi.getViolationTypes()
      setStats(statsData)
      setViolationTypes(violationData.map((v: { name: string; percentage: number }) => ({ ...v, color: 'bg-accent' })))
    } catch (error) {
      console.error('Failed to load analytics:', error)
    }
  }

  // Standard navigation matching dashboard
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics', active: true },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const completionRates = [
    { category: 'STEM', rate: 85 },
    { category: 'Arts', rate: 65 },
    { category: 'Law', rate: 92 },
    { category: 'Med', rate: 45 },
    { category: 'Bus', rate: 78 }
  ]

  const scheduledReports = [
    {
      name: 'Weekly Integrity Audit',
      frequency: 'Every Monday',
      recipients: '3 Admins',
      nextRun: 'Oct 23, 08:00'
    },
    {
      name: 'Monthly Violation Summary',
      frequency: '1st of Month',
      recipients: 'Dean Office',
      nextRun: 'Nov 01, 00:00'
    },
    {
      name: 'Daily Session Logs',
      frequency: 'Daily',
      recipients: 'IT Dept',
      nextRun: 'Oct 20, 23:00'
    },
    {
      name: 'Proctor Performance',
      frequency: 'Bi-Weekly',
      recipients: 'Head Proctor',
      nextRun: 'Oct 27, 12:00'
    }
  ]

  const handleGenerateReport = async () => {
    const blob = await reportsApi.generate(reportType, dateRange, format)
    console.log('Generated report:', reportType, 'in', format)
    // In production: download the blob as a file
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-3 text-primary">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-white">
                <Shield className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Exam Lockdown</h2>
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-background" />
            </Button>
            
            <Link href="/settings">
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            
            <Separator orientation="vertical" className="h-8" />
            
            <div className="size-9 rounded-full bg-muted overflow-hidden border">
              <div className="size-full bg-slate-300" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r bg-background min-h-[calc(100vh-64px)] p-4 flex flex-col">
          <nav className="flex flex-col gap-1">
            {navigation.map((item: { id: string; label: string; icon: React.ElementType; href: string; active?: boolean }) => (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  pathname === item.href || item.active
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>
          
          <div className="mt-auto pt-4 border-t">
            <Link href="/support" className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-lg transition-colors">
              <HelpCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Support</span>
            </Link>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-muted/30">
            {/* Report Generation Form */}
            <Card className="bg-surface border-border-subtle">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Description className="h-5 w-5 text-accent" />
                  <CardTitle className="text-white">Report Generation</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Report Type
                    </label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger className="bg-background-dark border-border-subtle text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="session-summary">Session Summary</SelectItem>
                        <SelectItem value="violation-analysis">Violation Analysis</SelectItem>
                        <SelectItem value="integrity-scorecard">Integrity Scorecard</SelectItem>
                        <SelectItem value="student-performance">Student Performance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Date Range
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="bg-background-dark border-border-subtle text-white pl-10"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Format
                    </label>
                    <Select value={format} onValueChange={setFormat}>
                      <SelectTrigger className="bg-background-dark border-border-subtle text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF Document</SelectItem>
                        <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                        <SelectItem value="csv">CSV Data</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    onClick={handleGenerateReport}
                    className="bg-accent hover:bg-blue-600 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Generate Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Analytics Charts Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Violation Trends */}
              <Card className="bg-surface border-border-subtle flex flex-col xl:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Violation Trends</CardTitle>
                      <CardDescription>Total flags detected over time</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white">
                        <FileTextIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="h-64 bg-gradient-to-t from-accent/10 to-transparent rounded-lg relative flex items-end justify-around px-4 pb-4">
                    {/* SVG Chart Placeholder */}
                    <svg className="w-full h-full absolute inset-0 opacity-20 pointer-events-none" viewBox="0 0 400 100">
                      <path d="M0,80 Q50,20 100,50 T200,30 T300,70 T400,10" fill="none" stroke="#3b82f6" strokeWidth="2" />
                      <path d="M0,80 Q50,20 100,50 T200,30 T300,70 T400,10 V100 H0 Z" fill="url(#grad)" />
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.5 }} />
                          <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="text-[10px] text-muted-foreground absolute bottom-1 left-4">Oct 1</div>
                    <div className="text-[10px] text-muted-foreground absolute bottom-1 right-4">Oct 31</div>
                  </div>
                </CardContent>
              </Card>

              {/* Violation Type Distribution */}
              <Card className="bg-surface border-border-subtle">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Violation Types</CardTitle>
                      <CardDescription>Categorized flagged behaviors</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    <div className="size-48 rounded-full border-[12px] border-accent border-r-primary border-b-primary/50 flex items-center justify-center mb-6 relative">
                      <div className="text-center">
                        <p className="text-2xl font-black text-white">42%</p>
                        <p className="text-[10px] uppercase text-muted-foreground font-bold">Multiple Faces</p>
                      </div>
                    </div>
                    <div className="w-full space-y-3">
                      {violationTypes.map((type, index) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className={`size-2 rounded-full ${type.color}`}></div>
                            <span className="text-muted-foreground">{type.name}</span>
                          </div>
                          <span className="text-white font-bold">{type.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Exam Completion & Scheduled Reports */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Exam Completion Rates Bar Chart */}
              <Card className="bg-surface border-border-subtle">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Completion Rates</CardTitle>
                      <CardDescription>By course category</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 h-64 flex flex-col justify-end">
                    <div className="flex items-end gap-4 h-48 w-full px-2">
                      {completionRates.map((rate, index) => (
                        <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                          <div 
                            className="w-full bg-primary/40 rounded-t-lg group-hover:bg-accent transition-all duration-300"
                            style={{ height: `${rate}%` }}
                          ></div>
                          <span className="text-[10px] text-muted-foreground font-medium">{rate.category}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scheduled Reports Table */}
              <Card className="bg-surface border-border-subtle flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Scheduled Reports</CardTitle>
                      <CardDescription>Automatically generated tasks</CardDescription>
                    </div>
                    <Button variant="ghost" className="text-accent text-xs font-bold hover:underline flex items-center gap-1">
                      <Plus className="h-3 w-3" />
                      New Schedule
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px] text-muted-foreground uppercase font-bold border-b border-border-subtle">
                          <TableHead className="pb-3 px-2">Report Name</TableHead>
                          <TableHead className="pb-3 px-2">Frequency</TableHead>
                          <TableHead className="pb-3 px-2">Recipients</TableHead>
                          <TableHead className="pb-3 px-2">Next Run</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scheduledReports.map((report, index) => (
                          <TableRow key={index} className="text-xs text-muted-foreground divide-y divide-border-subtle/30">
                            <TableCell className="py-4 px-2 font-medium text-white">
                              {report.name}
                            </TableCell>
                            <TableCell className="py-4 px-2">{report.frequency}</TableCell>
                            <TableCell className="py-4 px-2">{report.recipients}</TableCell>
                            <TableCell className="py-4 px-2">{report.nextRun}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Footer */}
            <footer className="mt-auto p-8 border-t bg-muted/30">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 opacity-50">
                  <Shield className="h-4 w-4" />
                  <p className="text-[10px] font-medium uppercase tracking-widest">
                    Exam Lockdown v2.4.1
                  </p>
                </div>
                <div className="flex gap-6 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <Link href="/support" className="hover:text-primary transition-colors">Support Center</Link>
                  <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                  <Link href="/audit" className="hover:text-primary transition-colors">Audit Logs</Link>
                </div>
              </div>
            </footer>
        </main>
      </div>
    </div>
  )
}
