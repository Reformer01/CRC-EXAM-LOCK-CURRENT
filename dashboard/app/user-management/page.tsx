'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Lock, Search, Bell, Settings, LayoutDashboard, Users, FileText, BarChart3, AlertTriangle,
  Upload, UserPlus, Eye, Lock as LockIcon, Ban, ChevronLeft, ChevronRight,
  TrendingUp, Shield, Radio, FileStack, UserCog, HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { usersApi, type User } from '@/lib/data-service'

export default function UserManagementPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await usersApi.getAll()
      setUsers(data)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleImportCSV = async () => {
    const result = await usersApi.importCSV('mock-csv-data')
    console.log('Import result:', result)
    await loadUsers()
  }

  const handleAddUser = async () => {
    const newUser = await usersApi.addUser({
      name: 'New Student',
      email: 'new.student@university.edu',
      studentId: '#STU-' + Math.floor(Math.random() * 100000),
      department: 'Undeclared',
      totalExams: 0,
      flagHistory: '0 / 10',
      avatar: 'https://lh3.googleusercontent.com/aida-public/placeholder'
    })
    if (newUser) {
      setUsers([...users, newUser])
    }
  }

  const handleViewProfile = (userId: number) => {
    console.log('View profile:', userId)
  }

  const handleResetMFA = async (userId: number) => {
    const success = await usersApi.resetMFA(userId)
    if (success) {
      console.log('MFA reset for user:', userId)
    }
  }

  const handleDeactivate = async (userId: number) => {
    const success = await usersApi.deactivate(userId)
    if (success) {
      setUsers(users.filter(u => u.id !== userId))
    }
  }

  // Standard navigation matching dashboard
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management', active: true },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const stats = [
    {
      title: 'Total Students',
      value: '1,240',
      change: '+2.4%',
      trend: 'up',
      color: 'text-emerald-500'
    },
    {
      title: 'Flagged Users',
      value: '12',
      change: 'High Risk',
      trend: 'neutral',
      color: 'text-amber-500'
    },
    {
      title: 'Recently Added',
      value: '48',
      change: 'This Week',
      trend: 'neutral',
      color: 'text-slate-400'
    }
  ]

  const getFlagColor = (flagHistory: string) => {
    const [flags] = flagHistory.split(' / ').map(Number)
    if (flags === 0) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
    if (flags <= 2) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark overflow-x-hidden">
        {/* Top Nav Bar */}
        <header className="flex items-center justify-between whitespace-nowrap border-b border-slate-200 dark:border-slate-800 px-6 py-3 bg-white dark:bg-background-dark sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="size-8 flex items-center justify-center bg-primary rounded-lg text-white">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight">Exam Lockdown</h2>
            </Link>
          </div>
          <div className="flex flex-1 justify-end gap-4 items-center">
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                <Bell className="h-5 w-5" />
              </Button>
              <Link href="/settings">
                <Button variant="ghost" size="icon" className="h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
            </div>
            <div className="h-10 w-10 rounded-full border-2 border-primary/20 bg-primary/10 overflow-hidden">
              <div className="h-full w-full bg-slate-300" />
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          {/* Sidebar Navigation */}
          <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark p-4 gap-2">
            <div className="flex items-center gap-3 px-3 py-4 mb-2">
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary dark:text-slate-200 font-bold">A</div>
              <div className="flex flex-col">
                <h1 className="text-slate-900 dark:text-white text-sm font-semibold">Administrator</h1>
                <p className="text-slate-500 dark:text-slate-400 text-xs">System Portal</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    pathname === item.href || item.active
                      ? 'bg-primary text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-6 lg:p-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h2 className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">User Management</h2>
                <p className="text-slate-500 dark:text-slate-400 text-base">Manage student data and review exam integrity metrics.</p>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  onClick={handleImportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-slate-700 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                >
                  <Upload className="h-5 w-5" />
                  Import CSV
                </Button>
                <Button 
                  onClick={handleAddUser}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-opacity-90 shadow-lg shadow-primary/20"
                >
                  <UserPlus className="h-5 w-5" />
                  Add User
                </Button>
              </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {stats.map((stat, index) => (
                <Card key={index} className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <CardContent className="p-6 flex flex-col gap-1">
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{stat.title}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</span>
                      <span className={`text-sm font-medium ${stat.color}`}>
                        {stat.change}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Search and Table Container */}
            <Card className="bg-white dark:bg-background-dark border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search by ID, Name, or Email"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <TableHead className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">Student</TableHead>
                      <TableHead className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">Student ID</TableHead>
                      <TableHead className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">Department</TableHead>
                      <TableHead className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">Total Exams</TableHead>
                      <TableHead className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">Flag History</TableHead>
                      <TableHead className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {users.map((user) => (
                      <TableRow key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/10 transition-colors group">
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{user.studentId}</TableCell>
                        <TableCell className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{user.department}</TableCell>
                        <TableCell className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{user.totalExams}</TableCell>
                        <TableCell className="px-6 py-4">
                          <Badge className={getFlagColor(user.flagHistory)}>
                            {user.flagHistory}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewProfile(user.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
                              title="View Profile"
                            >
                              <Eye className="h-5 w-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResetMFA(user.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-all"
                              title="Reset MFA"
                            >
                              <LockIcon className="h-5 w-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivate(user.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/20 transition-all"
                              title="Deactivate"
                            >
                              <Ban className="h-5 w-5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Showing 1 to 5 of 1,240 entries</p>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled 
                    className="px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded"
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm"
                    className="px-3 py-1 text-xs font-semibold text-white bg-primary rounded shadow-sm"
                  >
                    1
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    2
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    3
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          </main>
        </div>
      </div>
    </div>
  )
}
