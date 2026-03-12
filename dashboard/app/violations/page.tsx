'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Search, Bell, Settings, LayoutDashboard, AlertTriangle, 
  Video, BarChart3, Users, HelpCircle, ArrowUp, ArrowDown,
  Check, X, ExternalLink, EyeOff, Keyboard, Download, CheckCircle,
  Verified, Trash2, FileStack, Radio, UserCog, Eye, FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { violationsApi } from '@/lib/data-service'

export default function ViolationsManagementPage() {
  const [selectedViolations, setSelectedViolations] = useState<string[]>([])
  const [severityFilter, setSeverityFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('24h')
  const [searchQuery, setSearchQuery] = useState('')
  const pathname = usePathname()

  // Standard navigation matching dashboard
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations', active: true },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const stats = [
    {
      title: 'Total Violations',
      value: '1,284',
      change: '+12%',
      changeLabel: 'from last month',
      trend: 'up',
      icon: AlertTriangle
    },
    {
      title: 'Most Common',
      value: 'Tab Switching',
      subtitle: '42% of total flags',
      icon: ExternalLink
    },
    {
      title: 'Avg/Session',
      value: '2.4',
      change: '+5%',
      changeLabel: 'vs. industry avg',
      trend: 'up',
      icon: Users
    },
    {
      title: 'Clearance Rate',
      value: '89%',
      change: '-2%',
      changeLabel: 'pending reviews',
      trend: 'down',
      icon: CheckCircle
    }
  ]

  const violations = [
    {
      id: 'v1',
      timestamp: '10:42:15 AM',
      date: 'Oct 24, 2023',
      student: {
        name: 'John Smith',
        initials: 'JS',
        session: 'Session #8921-A'
      },
      type: 'Multiple Tabs Open',
      typeIcon: ExternalLink,
      typeIconColor: 'text-amber-500',
      severity: 'critical',
      status: 'pending'
    },
    {
      id: 'v2',
      timestamp: '10:38:02 AM',
      date: 'Oct 24, 2023',
      student: {
        name: 'Alice Miller',
        initials: 'AM',
        session: 'Session #8924-X'
      },
      type: 'Face Not Detected',
      typeIcon: EyeOff,
      typeIconColor: 'text-slate-500',
      severity: 'high',
      status: 'resolved'
    },
    {
      id: 'v3',
      timestamp: '10:35:54 AM',
      date: 'Oct 24, 2023',
      student: {
        name: 'Robert Brown',
        initials: 'RB',
        session: 'Session #8922-C'
      },
      type: 'Forbidden Hotkey',
      typeIcon: Keyboard,
      typeIconColor: 'text-blue-500',
      severity: 'medium',
      status: 'flagged'
    }
  ]

  const getSeverityBadge = (severity: string) => {
    const severityConfig = {
      critical: { label: 'Critical', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', dotColor: 'bg-rose-500' },
      high: { label: 'High', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dotColor: 'bg-amber-500' },
      medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dotColor: 'bg-blue-500' },
      low: { label: 'Low', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dotColor: 'bg-green-500' }
    }
    
    const config = severityConfig[severity as keyof typeof severityConfig]
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold ${config.color}`}>
        <span className={`size-1.5 rounded-full ${config.dotColor}`}></span>
        {config.label}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Pending Review', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
      resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
      flagged: { label: 'Flagged', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
      cleared: { label: 'Cleared', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig]
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const handleApproveViolation = async (id: string) => {
    const success = await violationsApi.approve(id)
    if (success) {
      console.log('Violation approved:', id)
    }
  }

  const handleRejectViolation = async (id: string) => {
    const success = await violationsApi.reject(id)
    if (success) {
      console.log('Violation rejected:', id)
    }
  }

  const handleBulkApprove = async () => {
    const count = await violationsApi.bulkApprove(selectedViolations)
    console.log('Bulk approved:', count, 'violations')
  }

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    const blob = await violationsApi.export(format)
    console.log('Exported violations:', format)
  }

  const handleSelectViolation = (violationId: string) => {
    setSelectedViolations(prev => 
      prev.includes(violationId) 
        ? prev.filter(id => id !== violationId)
        : [...prev, violationId]
    )
  }

  const handleSelectAll = () => {
    if (selectedViolations.length === violations.length) {
      setSelectedViolations([])
    } else {
      setSelectedViolations(violations.map(v => v.id))
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
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
            
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search violations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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
              <img
                alt="User Profile"
                className="size-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBpJwk7UmgWDcmaK5mJt7q-klqrMa3sVjGPQzXT9xcLW2OjDgNSAw4qkJifmxo9bT58ECtywORLOM899QYFukQF6zGxoSBp5iKcmxcHXSAF_geNahiz7juV9H3QkEsa08kBbyeD2Yoqcj0PJvVMToq9ZHeWBkQLjWgNqmqYw8AsfYE_7mVOumqZuNECm-x4PVYiZrL7ZDn7tZuYFjBl1F0HWOMQOnTtaTCmjMjr2CeWeV0LvWACln184Zh7nfUL8ORhcUtJVEpNWkhT"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
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
            <Link
              href="/support"
              className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
            >
              <HelpCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Support</span>
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Header Section */}
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tight">Violations Management</h1>
            <p className="text-muted-foreground">
              Review and moderate active integrity flags across all current exam sessions.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-3xl font-bold mt-2">{stat.value}</p>
                  {stat.subtitle && (
                    <p className="text-muted-foreground text-xs mt-1">{stat.subtitle}</p>
                  )}
                  {stat.change && (
                    <div className="flex items-center gap-1 mt-2">
                      <span className={`flex items-center text-xs font-bold ${
                        stat.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'
                      }`}>
                        {stat.trend === 'up' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )}
                        {stat.change}
                      </span>
                      <span className="text-muted-foreground text-xs">{stat.changeLabel}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table Actions & Filters */}
          <Card>
            <div className="flex flex-col md:flex-row justify-between gap-4 p-4 border-b bg-muted/50">
              <div className="flex items-center gap-2">
                <Button className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export List
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Verified className="h-4 w-4" />
                  Bulk Approve
                </Button>
                <Button variant="outline" size="icon" className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Filters:</span>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Severity: All</SelectItem>
                    <SelectItem value="high">Severity: High</SelectItem>
                    <SelectItem value="medium">Severity: Medium</SelectItem>
                    <SelectItem value="low">Severity: Low</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={timeFilter} onValueChange={setTimeFilter}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Time: Last 24h</SelectItem>
                    <SelectItem value="7d">Time: Last 7 days</SelectItem>
                    <SelectItem value="custom">Time: Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Violations Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 text-xs font-bold text-muted-foreground uppercase">
                    <TableHead className="w-10 px-6 py-4">
                      <Checkbox 
                        checked={selectedViolations.length === violations.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="px-6 py-4">Timestamp</TableHead>
                    <TableHead className="px-6 py-4">Student</TableHead>
                    <TableHead className="px-6 py-4">Violation Type</TableHead>
                    <TableHead className="px-6 py-4">Severity</TableHead>
                    <TableHead className="px-6 py-4">Status</TableHead>
                    <TableHead className="px-6 py-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {violations.map((violation) => (
                    <TableRow key={violation.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-6 py-4">
                        <Checkbox 
                          checked={selectedViolations.includes(violation.id)}
                          onCheckedChange={() => handleSelectViolation(violation.id)}
                        />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{violation.timestamp}</span>
                          <span className="text-xs text-muted-foreground">{violation.date}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground">
                            {violation.student.initials}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold">{violation.student.name}</span>
                            <Link href={`/sessions/${violation.student.session}`} className="text-xs text-primary hover:underline">
                              {violation.student.session}
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <violation.typeIcon className={`h-5 w-5 ${violation.typeIconColor}`} />
                          <span>{violation.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {getSeverityBadge(violation.severity)}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {getStatusBadge(violation.status)}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="p-1.5">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                            disabled={violation.status === 'resolved'}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-1.5 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                            disabled={violation.status === 'resolved'}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/50">
              <span className="text-xs text-muted-foreground">
                Showing 1-10 of 1,284 results
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="text-xs">
                  Previous
                </Button>
                <Button variant="default" size="sm" className="text-xs">
                  1
                </Button>
                <Button variant="outline" size="sm" className="text-xs">
                  2
                </Button>
                <Button variant="outline" size="sm" className="text-xs">
                  3
                </Button>
                <Button variant="outline" size="sm" className="text-xs">
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
