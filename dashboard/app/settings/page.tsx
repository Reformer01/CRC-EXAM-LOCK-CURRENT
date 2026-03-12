'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Shield, Bell, Settings, Users, Link as LinkIcon, 
  BellRing, HelpCircle, UserPlus, MoreHorizontal, Copy,
  AlertTriangle, LayoutDashboard, FileText, BarChart3, Radio, FileStack, UserCog
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

function getInitialsColor(role: string) {
  if (role === 'Super Admin') {
    return 'bg-primary/20 text-primary dark:text-slate-300'
  }
  return 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [institutionName, setInstitutionName] = useState('Global Institute of Technology')
  const [timezone, setTimezone] = useState('GMT')
  const [violationLimits, setViolationLimits] = useState('3')
  const [autoSubmitThreshold, setAutoSubmitThreshold] = useState('5')
  const [lmsEndpoint, setLmsEndpoint] = useState('https://api.canvas-lms.edu/v1/webhooks/lockdown')
  const [webhookSecret, setWebhookSecret] = useState('••••••••••••••••••••••••••••')
  const pathname = usePathname()

  const handleSaveSettings = () => {
    console.log('Saving settings:', { institutionName, timezone, violationLimits, autoSubmitThreshold })
  }

  const handleRegenerateSecret = () => {
    console.log('Regenerating secret...')
    setWebhookSecret('new-secret-' + Math.random().toString(36).substring(7))
  }

  const handleCopySecret = () => {
    navigator.clipboard.writeText(webhookSecret)
    console.log('Secret copied')
  }

  const handleInviteAdmin = () => {
    console.log('Inviting admin...')
  }

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'sessions', label: 'Sessions', icon: FileStack, href: '/sessions' },
    { id: 'exams', label: 'Exams', icon: FileText, href: '/exams' },
    { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '/violations' },
    { id: 'proctoring', label: 'Live Proctoring', icon: Radio, href: '/live-proctoring' },
    { id: 'users', label: 'User Management', icon: Users, href: '/user-management' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings', active: true },
    { id: 'admin', label: 'Admin Management', icon: UserCog, href: '/admin-management' },
  ]

  const settingsTabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'admin', label: 'Admin Management', icon: Users },
    { id: 'integration', label: 'Integration', icon: LinkIcon },
    { id: 'notifications', label: 'Notifications', icon: BellRing }
  ]

  const adminUsers = [
    {
      name: 'Sarah Anderson',
      initials: 'SA',
      email: 'sarah.a@institute.edu',
      role: 'Super Admin',
      roleColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      lastLogin: '2 mins ago'
    },
    {
      name: 'James Miller',
      initials: 'JM',
      email: 'j.miller@institute.edu',
      role: 'Proctor',
      roleColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      lastLogin: 'Yesterday, 4:30 PM'
    },
    {
      name: 'Elena Kostic',
      initials: 'EK',
      email: 'elena.k@institute.edu',
      role: 'Viewer',
      roleColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400',
      lastLogin: 'Oct 12, 2023'
    }
  ]

  const notificationSettings = [
    {
      event: 'Critical Security Violation',
      description: 'Alerted when a user bypasses the lockdown layer.',
      email: true,
      inApp: true,
      push: true
    },
    {
      event: 'New Proctor Invitation',
      description: 'When a new admin user accepts their invitation.',
      email: false,
      inApp: true,
      push: false
    },
    {
      event: 'System Performance Alerts',
      description: 'Daily summaries of server load and response times.',
      email: true,
      inApp: false,
      push: false
    }
  ]

  return (
    <div className="min-h-screen bg-background">
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
        <aside className="w-64 border-r bg-background min-h-[calc(100vh-64px)] p-4 flex flex-col">
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => (
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

        <main className="flex-1 overflow-y-auto p-6 bg-muted/30">
          <div className="flex gap-2 mb-6">
            {settingsTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Button>
            ))}
          </div>

          {activeTab === 'general' && (
            <section className="max-w-4xl space-y-6">
              <div>
                <h2 className="text-2xl font-bold">General Settings</h2>
                <p className="text-muted-foreground">
                  Configure your institution's core exam behavior and parameters.
                </p>
              </div>
              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="institution">Institution Name</Label>
                      <Input
                        id="institution"
                        value={institutionName}
                        onChange={(e) => setInstitutionName(e.target.value)}
                        className="border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PT">Pacific Time (PT) - UTC-8</SelectItem>
                          <SelectItem value="ET">Eastern Time (ET) - UTC-5</SelectItem>
                          <SelectItem value="GMT">Greenwich Mean Time (GMT) - UTC+0</SelectItem>
                          <SelectItem value="CET">Central European Time (CET) - UTC+1</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="violations">Violation Limits (Max Warnings)</Label>
                      <Input
                        id="violations"
                        type="number"
                        value={violationLimits}
                        onChange={(e) => setViolationLimits(e.target.value)}
                        className="border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="threshold">Auto-submit Threshold (Minutes)</Label>
                      <Input
                        id="threshold"
                        type="number"
                        value={autoSubmitThreshold}
                        onChange={(e) => setAutoSubmitThreshold(e.target.value)}
                        className="border-border"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-3 pt-4">
                      <Button variant="outline">Discard</Button>
                      <Button onClick={handleSaveSettings}>Save Changes</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === 'admin' && (
            <section className="max-w-5xl space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold">Admin Management</h2>
                  <p className="text-muted-foreground">
                    Manage team members and their access levels.
                  </p>
                </div>
                <Button onClick={handleInviteAdmin} className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Admin
                </Button>
              </div>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs uppercase tracking-wider text-muted-foreground">
                      <TableHead className="font-semibold">Admin Name</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Role</TableHead>
                      <TableHead className="font-semibold">Last Login</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.map((admin, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${getInitialsColor(admin.role)}`}>
                              {admin.initials}
                            </div>
                            <span className="font-medium">{admin.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                        <TableCell>
                          <Badge className={admin.roleColor}>
                            {admin.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{admin.lastLogin}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}

          {activeTab === 'integration' && (
            <section className="max-w-4xl space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Integration Settings</h2>
                <p className="text-muted-foreground">
                  Connect external systems and manage API authentication.
                </p>
              </div>
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="lms-api">LMS API Endpoint</Label>
                      <div className="relative">
                        <Input
                          id="lms-api"
                          value={lmsEndpoint}
                          onChange={(e) => setLmsEndpoint(e.target.value)}
                          className="pr-12 font-mono text-sm border-border"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          onClick={() => navigator.clipboard.writeText(lmsEndpoint)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="webhook-secret">Webhook Secret Key</Label>
                      <div className="relative">
                        <Input
                          id="webhook-secret"
                          type="password"
                          value={webhookSecret}
                          onChange={(e) => setWebhookSecret(e.target.value)}
                          className="pr-12 font-mono text-sm border-border"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          onClick={handleCopySecret}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Regenerating the secret key will immediately disconnect all current integrations using the old key.
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <Button variant="secondary" onClick={handleRegenerateSecret}>
                      Regenerate Secret
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === 'notifications' && (
            <section className="max-w-4xl space-y-6 pb-20">
              <div>
                <h2 className="text-2xl font-bold">Notification Preferences</h2>
                <p className="text-muted-foreground">
                  Choose how and when you want to be alerted about critical system events.
                </p>
              </div>
              <Card>
                <div className="grid grid-cols-12 px-6 py-4 bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <div className="col-span-6">Notification Event</div>
                  <div className="col-span-2 text-center">Email</div>
                  <div className="col-span-2 text-center">In-App</div>
                  <div className="col-span-2 text-center">Push</div>
                </div>
                <div className="divide-y divide-border">
                  {notificationSettings.map((notification, index) => (
                    <div key={index} className="grid grid-cols-12 px-6 py-5 items-center">
                      <div className="col-span-6">
                        <p className="font-medium">{notification.event}</p>
                        <p className="text-sm text-muted-foreground">{notification.description}</p>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Switch checked={notification.email} />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Switch checked={notification.inApp} />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Switch checked={notification.push} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
