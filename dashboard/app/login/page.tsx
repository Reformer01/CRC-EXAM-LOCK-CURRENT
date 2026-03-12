'use client'

import { useState } from 'react'
import { 
  Shield, Eye, EyeOff, Lock, LogIn, Check, AlertCircle, ArrowRight, Mail
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Handle login logic here
    setTimeout(() => setIsLoading(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background-dark to-primary/40 relative overflow-hidden">
      {/* Abstract Background Decoration */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-primary rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-8">
          {/* Logo Section */}
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-3 text-foreground mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg">
                <Shield className="h-8 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Exam Lockdown</h1>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Administrator Portal</p>
          </div>

          {/* Login Card */}
          <Card className="border shadow-2xl">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-xl font-semibold">Sign In</CardTitle>
              <CardDescription className="text-sm">
                Please enter your institutional credentials.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Field */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@school.edu"
                      className="pr-10"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-[11px] italic text-muted-foreground">
                    Institutional email required for admin access.
                  </p>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                    <Button variant="link" className="h-auto p-0 text-xs">
                      Forgot password?
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pr-10"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Sign In Button */}
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></div>
                      Signing in...
                    </div>
                  ) : (
                    <>
                      Sign In
                      <LogIn className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter>
              <Separator className="mb-4" />
              <div className="text-center w-full">
                <p className="text-sm text-muted-foreground">
                  Need access?{' '}
                  <Button variant="link" className="h-auto p-0 font-medium">
                    Contact IT Support
                  </Button>
                </p>
              </div>
            </CardFooter>
          </Card>

          {/* Footer Section */}
          <footer className="text-center">
            <p className="text-xs font-medium tracking-wider uppercase text-muted-foreground">
              Powered by Exam Lockdown v2.0
            </p>
          </footer>
        </div>
      </div>

      {/* System Status Bar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4">
        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">System Live</span>
          </div>
        </Badge>
        
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
          <div className="flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">AES-256 Secured</span>
          </div>
        </Badge>
      </div>
    </div>
  )
}
