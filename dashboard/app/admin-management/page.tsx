'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Search, Settings, Users, Link as LinkIcon, Bell, UserPlus, Edit, Trash2,
  CheckCircle, Info, Verified, LayoutDashboard, FileText, AlertTriangle,
  BarChart3, Radio, FileStack, UserCog, HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { adminsApi, type Admin } from '@/lib/data-service'

export default function AdminManagementPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [adminUsers, setAdminUsers] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    loadAdmins()
  }, [])

  const loadAdmins = async () => {
    try {
      setLoading(true)
      const data = await adminsApi.getAll()
      setAdminUsers(data)
    } catch (error) {
      console.error('Failed to load admins:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInviteAdmin = async () => {
    const newAdmin = await adminsApi.invite({
      name: 'New Admin',
      email: 'new.admin@institution.edu',
      avatar: 'https://lh3.googleusercontent.com/aida-public/placeholder',
      role: 'Proctor'
    })
    if (newAdmin) {
      setAdminUsers([...adminUsers, newAdmin])
    }
  }

  const handleEditAdmin = async (adminId: number) => {
    const updated = await adminsApi.update(adminId, { role: 'Proctor' })
    if (updated) {
      setAdminUsers(adminUsers.map(a => a.id === adminId ? updated : a))
    }
  }

  const handleRemoveAdmin = async (adminId: number) => {
    const success = await adminsApi.remove(adminId)
    if (success) {
      setAdminUsers(adminUsers.filter(a => a.id !== adminId))
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
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management', active: true },
  ]

  const rolePermissions = [
    {
      role: 'Super Admin',
      icon: Verified,
      iconColor: 'text-purple-500',
      permissions: [
        'Full system configuration access',
        'Manage all admin accounts',
        'Access to all exam logs & analytics'
      ]
    },
    {
      role: 'Proctor',
      icon: Users,
      iconColor: 'text-blue-500',
      permissions: [
        'Live monitoring of active exams',
        'Can flag or pause student sessions',
        'Cannot change security settings'
      ]
    },
    {
      role: 'Viewer',
      icon: Info,
      iconColor: 'text-slate-500',
      permissions: [
        'Read-only access to exam reports',
        'Export statistical data',
        'No administrative or proctoring control'
      ]
    }
  ]

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Super Admin':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
      case 'Proctor':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      case 'Viewer':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
      default:
        return 'bg-slate-100 text-slate-700'
    }
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
              <img
                alt="User Profile"
                className="size-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDHcCjtyY4Jl-m5Rap84cY67Zyd-W_CFuRfKO8XLAmEm2VJNKNnKOPxcDNetOQZtqL5XyUOav_G8dnx3lUhy2O8uYgryb_dpzPgRmQFAL5ieD5eYDCl8YSaq2bgYqznV8qilsTdg4mjpIuyndqJq7fjmnbcr8021EDXiJ69qTsMg61lFZlFRnRMAHQ3s9CHSd3y90Wi54Jf8gLdFbZFBsaBfEivLhBxs9FLQmfUiD4hurWw-ohATkWNEANiO-KOYjIirNv7sf83DoW5"
              />
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
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Admin Management</h2>
                <p className="text-muted-foreground mt-1">Manage institutional access and permission levels</p>
              </div>
              <Button 
                onClick={handleInviteAdmin}
                className="flex items-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Invite Admin
              </Button>
            </div>

            {/* Search and Filters */}
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4"
                />
              </div>
            </div>

            {/* Admin Table */}
            <Card className="overflow-hidden mb-10">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-bold uppercase tracking-wider">Admin Name</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider">Email Address</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider">Role</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider">Last Login</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.map((admin) => (
                      <TableRow key={admin.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <img src={admin.avatar} alt={admin.name} className="w-10 h-10 rounded-lg" />
                            <span className="font-medium text-sm">{admin.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{admin.email}</TableCell>
                        <TableCell>
                          <Badge className={getRoleColor(admin.role)}>
                            {admin.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{admin.lastLogin}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAdmin(admin.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveAdmin(admin.id)}
                              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Role Permissions Summary */}
            <div className="mt-12">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Role Permissions Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {rolePermissions.map((role) => (
                  <Card key={role.role} className="bg-muted/30">
                    <CardHeader>
                      <div className="flex items-center gap-2 mb-4">
                        <role.icon className={`h-5 w-5 ${role.iconColor}`} />
                        <CardTitle className="text-base">{role.role}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {role.permissions.map((permission, index) => (
                          <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                            {permission}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
