'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Search, ChevronLeft, ChevronRight, FileDown, 
  Bell, PlayCircle, CheckCircle, XCircle, Verified,
  MoreVertical, Users, ExternalLink, ShieldAlert, Monitor, Minus,
  UsersRound, LayoutDashboard, FileText, AlertTriangle, BarChart3, 
  Radio, FileStack, UserCog, HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { reportsApi } from '@/lib/data-service'

export default function SessionManagementPage() {
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pathname = usePathname()

  // Standard navigation matching dashboard
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions', active: true },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Shield, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const statusFilters = [
    { id: 'active', label: 'Active', icon: PlayCircle, count: 12, color: 'text-blue-500' },
    { id: 'completed', label: 'Completed', icon: CheckCircle, count: 142, color: 'text-green-500' },
    { id: 'disqualified', label: 'DQ (Disqualified)', icon: XCircle, count: 3, color: 'text-red-500' },
    { id: 'cleared', label: 'Cleared', icon: Verified, count: 85, color: 'text-emerald-500' }
  ]

  const sessions = [
    {
      id: 'EX-8291',
      studentName: 'Jane Doe',
      email: 'jane.doe@university.edu',
      initials: 'JD',
      startTime: '09:15 AM',
      duration: '45m 12s',
      status: 'active',
      violations: [
        { type: 'Multiple Faces Detected', icon: UsersRound },
        { type: 'Tab Switch Detected', icon: ExternalLink }
      ],
      violationCount: 2
    },
    {
      id: 'EX-8245',
      studentName: 'Samuel Miller',
      email: 's.miller@university.edu',
      initials: 'SM',
      startTime: '09:02 AM',
      duration: '12m 04s',
      status: 'disqualified',
      violations: [
        { type: 'Leak Detected', icon: ShieldAlert },
        { type: 'Desktop Access', icon: Monitor }
      ],
      violationCount: 8,
      isFlagged: true
    },
    {
      id: 'EX-8302',
      studentName: 'Alice Luong',
      email: 'alice.l@university.edu',
      initials: 'AL',
      startTime: '09:10 AM',
      duration: '1h 15m',
      status: 'completed',
      violations: [],
      violationCount: 0
    },
    {
      id: 'EX-8315',
      studentName: 'Robert White',
      email: 'rwhite@university.edu',
      initials: 'RW',
      startTime: '09:20 AM',
      duration: '40m 45s',
      status: 'active',
      violations: [],
      violationCount: 0
    }
  ]

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Active', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: true },
      completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: false },
      disqualified: { label: 'DQ', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: false },
      cleared: { label: 'Cleared', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: false }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig]
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${config.color}`}>
        {config.dot && <span className="size-1.5 bg-blue-500 rounded-full"></span>}
        {config.label}
      </span>
    )
  }

  const getInitialsColor = (initials: string, status: string) => {
    if (status === 'disqualified') return 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200'
    return 'bg-primary/10 text-primary dark:text-slate-200'
  }

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    )
  }

  const handleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([])
    } else {
      setSelectedSessions(sessions.map(s => s.id))
    }
  }

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx' = 'csv') => {
    const blob = await reportsApi.generate('sessions', 'current', format)
    console.log('Exported sessions report:', format)
    // In production: download the blob as a file
  }

  const handleClearFilters = () => {
    setStatusFilter('active')
    setSearchQuery('')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 text-primary">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-white">
                <Shield className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Exam Lockdown</h2>
            </div>
            
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Date Navigator */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Oct 24, 2023
              </span>
              <Button variant="ghost" size="sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            <Button 
              className="flex items-center gap-2"
              onClick={() => handleExport('csv')}
            >
              <FileDown className="h-4 w-4" />
              Export
            </Button>
            
            <div className="h-8 w-px bg-border mx-2" />
            
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-background" />
            </Button>
            
            <div className="size-9 rounded-full bg-muted overflow-hidden border">
              <img
                alt="User Profile"
                className="size-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC4iQ2YRxqVkbgMHSozT8HrKK7MESABBw6VbSKfDlKvK4BcM71IswxFsIkn-vsGnBlz4OMfjEj2JpAJtBGsaYnYc84C2eduq-_O6G6ZkcOUjbXxGjm2uVGE1aF0BJXvD0Y_xbkZwOcDpR710Y42reu0RNUblALB24II2ahQb6THHRyvvLNeS3mYhAYmfFufMQ6quDE8F-bHl7AdssbYVry-zuZb4zZX3xqaP_AcD9jDzHjZB7t1Tm-3bKJ0DnDmma9GY-UzpmfP1k3Z"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Filters */}
        <aside className="w-64 border-r bg-background p-6 flex flex-col gap-8 overflow-y-auto">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Status Filters
            </h3>
            <nav className="flex flex-col gap-1">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.id}
                  variant={statusFilter === filter.id ? "secondary" : "ghost"}
                  className="justify-start h-auto p-3"
                  onClick={() => setStatusFilter(filter.id)}
                >
                  <filter.icon className={`h-5 w-5 ${filter.color}`} />
                  <span className="text-sm font-medium">{filter.label}</span>
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-muted rounded-full">
                    {filter.count}
                  </span>
                </Button>
              ))}
            </nav>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Violation Count
            </h3>
            <div className="space-y-3">
              {['0 Violations', '1 - 3 Violations', '4+ Violations'].map((label, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Checkbox id={`v-${index}`} />
                  <label htmlFor={`v-${index}`} className="text-sm text-muted-foreground">
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Duration
            </h3>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Any duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any duration</SelectItem>
                <SelectItem value="under-30">Under 30 mins</SelectItem>
                <SelectItem value="30-60">30 - 60 mins</SelectItem>
                <SelectItem value="1-2">1 - 2 hours</SelectItem>
                <SelectItem value="2+">2+ hours</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <div className="mt-auto">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleClearFilters}
            >
              Clear All Filters
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Session Management</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Monitoring 242 total sessions for "Midterm Examination - CS101"
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-background border rounded-lg shadow-sm">
                <span className="size-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-bold uppercase tracking-tighter text-muted-foreground">
                  Live Monitor
                </span>
              </div>
            </div>
          </div>

          {/* Sessions Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10 p-4">
                    <Checkbox 
                      checked={selectedSessions.length === sessions.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Student Name
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Email Address
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Session ID
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Start Time
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Duration
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">
                    Violations
                  </TableHead>
                  <TableHead className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow 
                    key={session.id}
                    className={`hover:bg-muted/50 transition-colors ${
                      session.isFlagged ? 'bg-red-50/20 dark:bg-red-900/5' : ''
                    }`}
                  >
                    <TableCell className="p-4">
                      <Checkbox 
                        checked={selectedSessions.includes(session.id)}
                        onCheckedChange={() => handleSelectSession(session.id)}
                      />
                    </TableCell>
                    <TableCell className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${getInitialsColor(session.initials, session.status)}`}>
                          {session.initials}
                        </div>
                        <span className="text-sm font-semibold">{session.studentName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="p-4 text-sm text-muted-foreground">
                      {session.email}
                    </TableCell>
                    <TableCell className="p-4 text-sm font-mono text-muted-foreground">
                      #{session.id}
                    </TableCell>
                    <TableCell className="p-4 text-sm">
                      {session.startTime}
                    </TableCell>
                    <TableCell className="p-4 text-sm">
                      {session.duration}
                    </TableCell>
                    <TableCell className="p-4">
                      {getStatusBadge(session.status)}
                    </TableCell>
                    <TableCell className="p-4 text-center">
                      {session.violations.length > 0 ? (
                        <div className="flex items-center justify-center gap-1 text-red-500">
                          {session.violations.map((violation, index) => (
                            <violation.icon 
                              key={index}
                              className="h-4 w-4"
                            />
                          ))}
                          <span className="text-xs font-bold ml-1">{session.violationCount}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center text-muted-foreground">
                          <Minus className="h-4 w-4 opacity-20" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-4 text-right">
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            <div className="px-6 py-4 flex items-center justify-between border-t">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-tight">
                Showing 4 of 242 sessions
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Previous</Button>
                <Button variant="default" size="sm">1</Button>
                <Button variant="outline" size="sm">2</Button>
                <Button variant="outline" size="sm">3</Button>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
