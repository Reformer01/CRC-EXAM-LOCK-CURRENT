'use client'

import { useState } from 'react'
import { 
  ArrowLeft, Eye, Download, Check, X, AlertTriangle, Clock, User,
  Calendar, Monitor, Shield, Activity, FileText, MessageSquare,
  RefreshCw, ChevronDown, MoreVertical, Copy, ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function SessionDetailsPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedAction, setSelectedAction] = useState('')

  // Mock session data
  const session = {
    id: '#EX-8291',
    student: {
      name: 'Jane Doe',
      email: 'jane.doe@university.edu',
      initials: 'JD',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4iQ2YRxqVkbgMHSozT8HrKK7MESABBw6VbSKfDlKvK4BcM71IswxFsIkn-vsGnBlz4OMfjEj2JpAJtBGsaYnYc84C2eduq-_O6G6ZkcOUjbXxGjm2uVGE1aF0BJXvD0Y_xbkZwOcDpR710Y42reu0RNUblALB24II2ahQb6THHRyvvLNeS3mYhAYmfFufMQ6quDE8F-bHl7AdssbYVry-zuZb4zZX3xqaP_AcD9jDzHjZB7t1Tm-3bKJ0DnDmma9GY-UzpmfP1k3Z'
    },
    exam: {
      title: 'Calculus II Final Exam',
      code: 'MATH-201',
      duration: '2 hours',
      startTime: '09:15 AM',
      endTime: '11:15 AM',
      formUrl: 'https://docs.google.com/forms/d/1ABC123/viewform'
    },
    status: 'active',
    startTime: '09:15 AM',
    currentDuration: '45m 12s',
    violations: [
      {
        id: 'v1',
        timestamp: '10:42:15 AM',
        type: 'Multiple Faces Detected',
        typeIcon: AlertTriangle,
        severity: 'critical',
        description: 'System detected multiple faces in camera view',
        status: 'pending'
      },
      {
        id: 'v2',
        timestamp: '10:38:02 AM',
        type: 'Tab Switch Detected',
        typeIcon: Monitor,
        severity: 'high',
        description: 'Student switched to another browser tab',
        status: 'pending'
      }
    ],
    progress: {
      completed: 65,
      remaining: '12m 48s',
      questionsAnswered: 13,
      totalQuestions: 20
    },
    systemInfo: {
      ipAddress: '192.168.1.105',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      browser: 'Chrome 118.0.5993.88',
      os: 'Windows 10',
      extensionVersion: 'v2.0.1'
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Active', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: true },
      completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: false },
      disqualified: { label: 'Disqualified', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: false },
      cleared: { label: 'Cleared', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: false }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig]
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${config.color}`}>
        {config.dot && <span className="size-1.5 bg-blue-500 rounded-full animate-pulse"></span>}
        {config.label}
      </span>
    )
  }

  const getSeverityBadge = (severity: string) => {
    const severityConfig = {
      critical: { label: 'Critical', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
      high: { label: 'High', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
      medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      low: { label: 'Low', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
    }
    
    const config = severityConfig[severity as keyof typeof severityConfig]
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const handleAction = (action: string) => {
    setSelectedAction(action)
    // Handle action logic here
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Sessions
            </Button>
            <div className="h-6 w-px bg-border"></div>
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-white">
                <Eye className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Session Details</h2>
                <p className="text-sm text-muted-foreground">{session.id}</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Session
            </Button>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh Data
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Student & Exam Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <User className="h-5 w-5" />
                  Student Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {session.student.initials}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{session.student.name}</h3>
                    <p className="text-sm text-muted-foreground">{session.student.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {getStatusBadge(session.status)}
                      <Badge variant="outline" className="text-xs">
                        Session ID: {session.id}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" className="flex items-center gap-2">
                      <Copy className="h-3 w-3" />
                      Copy ID
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-2">
                      <ExternalLink className="h-3 w-3" />
                      View Form
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <FileText className="h-5 w-5" />
                  Exam Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Exam Title</p>
                  <p className="font-semibold">{session.exam.title}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Course Code</p>
                  <p className="font-semibold">{session.exam.code}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Duration</p>
                  <p className="font-semibold">{session.exam.duration}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Time Window</p>
                  <p className="font-semibold">{session.exam.startTime} - {session.exam.endTime}</p>
                </div>
                <div className="pt-2">
                  <Button variant="outline" size="sm" className="w-full">
                    View Exam Form
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress & Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Activity className="h-5 w-5" />
                  Session Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Completion</span>
                    <span className="font-medium">{session.progress.completed}%</span>
                  </div>
                  <Progress value={session.progress.completed} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Questions Answered</p>
                    <p className="text-lg font-semibold">{session.progress.questionsAnswered}/{session.progress.totalQuestions}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time Remaining</p>
                    <p className="text-lg font-semibold">{session.progress.remaining}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Duration</p>
                  <p className="text-lg font-semibold">{session.currentDuration}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Shield className="h-5 w-5" />
                  Security Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Fullscreen Mode</span>
                  <Badge variant="default" className="bg-green-100 text-green-700">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Camera Monitoring</span>
                  <Badge variant="default" className="bg-green-100 text-green-700">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Tab Lock</span>
                  <Badge variant="default" className="bg-green-100 text-green-700">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Extension Status</span>
                  <Badge variant="default" className="bg-blue-100 text-blue-700">{session.systemInfo.extensionVersion}</Badge>
                </div>
                <div className="pt-2">
                  <Button className="w-full" variant="destructive" size="sm">
                    Force Disqualification
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs Section */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="violations">Violations</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="system">System Info</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Session Overview</CardTitle>
                  <CardDescription>Complete summary of the exam session</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Start Time</p>
                          <p className="font-semibold">{session.startTime}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Monitor className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Browser</p>
                          <p className="font-semibold">{session.systemInfo.browser}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Date</p>
                          <p className="font-semibold">October 24, 2023</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Total Violations</p>
                          <p className="font-semibold">{session.violations.length}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Security Score</p>
                          <p className="font-semibold">85/100</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Activity Level</p>
                          <p className="font-semibold">Normal</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Violations Tab */}
            <TabsContent value="violations" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Violation History</CardTitle>
                      <CardDescription>All integrity flags for this session</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        Clear All Violations
                      </Button>
                      <Button size="sm">
                        Add Note
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {session.violations.map((violation) => (
                        <TableRow key={violation.id}>
                          <TableCell className="font-medium">{violation.timestamp}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <violation.typeIcon className="h-4 w-4 text-amber-500" />
                              {violation.type}
                            </div>
                          </TableCell>
                          <TableCell>{getSeverityBadge(violation.severity)}</TableCell>
                          <TableCell>{getSeverityBadge(violation.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Session Timeline</CardTitle>
                  <CardDescription>Chronological events during the exam</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="size-3 rounded-full bg-green-500"></div>
                        <div className="w-0.5 h-16 bg-border"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Session Started</p>
                        <p className="text-sm text-muted-foreground">09:15 AM - Student began exam</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="size-3 rounded-full bg-amber-500"></div>
                        <div className="w-0.5 h-16 bg-border"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Tab Switch Detected</p>
                        <p className="text-sm text-muted-foreground">10:38 AM - Student switched to another tab</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="size-3 rounded-full bg-rose-500"></div>
                        <div className="w-0.5 h-16 bg-border"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Multiple Faces Detected</p>
                        <p className="text-sm text-muted-foreground">10:42 AM - System detected multiple faces</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="size-3 rounded-full bg-blue-500 animate-pulse"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Session Active</p>
                        <p className="text-sm text-muted-foreground">Currently in progress - 65% complete</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* System Info Tab */}
            <TabsContent value="system" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>System Information</CardTitle>
                  <CardDescription>Technical details about the session</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">IP Address</p>
                        <p className="font-mono">{session.systemInfo.ipAddress}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Browser</p>
                        <p className="font-mono text-sm">{session.systemInfo.browser}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Operating System</p>
                        <p className="font-mono text-sm">{session.systemInfo.os}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Extension Version</p>
                        <p className="font-mono">{session.systemInfo.extensionVersion}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">User Agent</p>
                        <p className="font-mono text-xs break-all">{session.systemInfo.userAgent}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Form URL</p>
                        <p className="font-mono text-xs break-all">{session.exam.formUrl}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative actions for this session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Clear Violations
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Contact Student
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Extend Time
                </Button>
                <Button variant="destructive" className="flex items-center gap-2">
                  <X className="h-4 w-4" />
                  Force Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
