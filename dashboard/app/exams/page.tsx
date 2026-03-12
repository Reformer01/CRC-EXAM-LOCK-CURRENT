'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Search, LayoutDashboard, FileText, Users, AlertTriangle, Settings, 
  Plus, Filter, ChevronDown, Edit, Copy, Eye, Archive, ArchiveRestore, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Zap, Calendar,
  FileStack, Radio, UserCog, HelpCircle, Bell, BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { examsApi, type Exam } from '@/lib/data-service'

export default function ExamManagementPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    loadExams()
  }, [])

  const loadExams = async () => {
    try {
      setLoading(true)
      const data = await examsApi.getAll()
      setExams(data)
    } catch (error) {
      console.error('Failed to load exams:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateExam = async () => {
    const newExam = await examsApi.create({
      title: 'New Exam',
      courseCode: 'NEW-101',
      status: 'scheduled',
      scheduledDate: new Date().toLocaleDateString(),
      duration: '60 mins',
      violationProfile: 'Standard Lockdown'
    })
    if (newExam) {
      setExams([...exams, newExam])
    }
  }

  const handleEditExam = async (examId: number) => {
    const updated = await examsApi.update(examId, { title: 'Updated Exam' })
    if (updated) {
      setExams(exams.map(e => e.id === examId ? updated : e))
    }
  }

  const handleDuplicateExam = async (examId: number) => {
    const duplicated = await examsApi.duplicate(examId)
    if (duplicated) {
      setExams([...exams, duplicated])
    }
  }

  const handlePreviewExam = (examId: number) => {
    console.log('Preview exam:', examId)
  }

  const handleArchiveExam = async (examId: number) => {
    const archived = await examsApi.archive(examId)
    if (archived) {
      setExams(exams.map(e => e.id === examId ? archived : e))
    }
  }

  // Standard navigation matching dashboard
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams', active: true },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const stats = [
    {
      title: 'Total Exams',
      value: 124,
      change: '+12%',
      trend: 'up',
      icon: FileText,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    },
    {
      title: 'Active Today',
      value: 8,
      change: 'Stable',
      trend: 'neutral',
      icon: Zap,
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
    },
    {
      title: 'Upcoming Sessions',
      value: exams.filter(e => e.status === 'scheduled').length,
      change: '-5%',
      trend: 'down',
      icon: Calendar,
      color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
    }
  ]

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Active', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
      draft: { label: 'Draft', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      scheduled: { label: 'Scheduled', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
      archived: { label: 'Archived', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400' }
    }
    const config = statusConfig[status as keyof typeof statusConfig]
    
    // Return default badge if status not found
    if (!config) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
          {status}
        </span>
      )
    }
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
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
              <div className="size-full bg-cover bg-center bg-slate-300" />
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
            <Link
              href="#"
              className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
            >
              <HelpCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Support</span>
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-muted/30">
          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                Exam Management
              </h1>
              <p className="text-muted-foreground">
                Create, configure, and monitor exam integrity protocols.
              </p>
            </div>
            <Button 
              onClick={handleCreateExam}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create New Exam
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {stats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`p-2 rounded-lg ${stat.color}`}>
                      <stat.icon className="h-5 w-5" />
                    </span>
                    <span className={`text-sm font-bold flex items-center ${
                      stat.trend === 'up' ? 'text-emerald-500' : 
                      stat.trend === 'down' ? 'text-rose-500' : 'text-slate-400'
                    }`}>
                      {stat.trend === 'up' && <TrendingUp className="h-4 w-4 mr-1" />}
                      {stat.trend === 'down' && <TrendingDown className="h-4 w-4 mr-1" />}
                      {stat.change}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">{stat.title}</p>
                  <h3 className="text-3xl font-bold mt-1">{stat.value}</h3>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Exams Table */}
          <Card>
            {/* Table Header with Filters */}
            <div className="p-4 border-b flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search exam names, departments, or semesters..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  Department: All <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  Semester: Fall 2023 <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  Status: All <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  More Filters
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="px-6 py-4">Exam Title</TableHead>
                    <TableHead className="px-6 py-4">Course Code</TableHead>
                    <TableHead className="px-6 py-4">Status</TableHead>
                    <TableHead className="px-6 py-4">Scheduled Date</TableHead>
                    <TableHead className="px-6 py-4">Duration</TableHead>
                    <TableHead className="px-6 py-4">Violation Profile</TableHead>
                    <TableHead className="px-6 py-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((exam) => (
                    <TableRow key={exam.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-6 py-4 font-semibold text-sm">{exam.title}</TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground">{exam.courseCode}</TableCell>
                      <TableCell className="px-6 py-4">{getStatusBadge(exam.status)}</TableCell>
                      <TableCell className="px-6 py-4 text-sm">{exam.scheduledDate}</TableCell>
                      <TableCell className="px-6 py-4 text-sm">{exam.duration}</TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="text-xs bg-muted px-2 py-1 rounded">
                          {exam.violationProfile}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditExam(exam.id)}
                            className="hover:text-primary"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDuplicateExam(exam.id)}
                            className="hover:text-primary"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handlePreviewExam(exam.id)}
                            className="hover:text-primary"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleArchiveExam(exam.id)}
                            className="hover:text-rose-500"
                          >
                            {exam.status === 'archived' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Showing 1 to 5 of 124 exams</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="default" size="sm">1</Button>
                <Button variant="outline" size="sm">2</Button>
                <Button variant="outline" size="sm">3</Button>
                <Button variant="outline" size="sm">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
