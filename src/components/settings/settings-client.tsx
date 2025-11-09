"use client"

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Download, Trash2, Keyboard, Sun, Moon, Laptop, Grid3x3, List, Map, Sparkles } from 'lucide-react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { UserPreferences, DEFAULT_PREFERENCES } from '@/types/user-preferences'
import { Button } from "@/components/adapters/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/adapters/card"
import { Label } from "@/components/adapters/label"
import { Slider } from '@/components/ui/slider'
import { Separator } from "@/components/adapters/separator"
import { Switch } from "@/components/adapters/switch"
import { toast } from 'sonner'
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog'
import { useUIRefresh } from '@/lib/feature-flags'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/adapters/select"

export function SettingsClient() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [preferences, setPreferences] = useLocalStorage<UserPreferences>(
    'user-preferences',
    DEFAULT_PREFERENCES
  )
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [uiRefreshEnabled, toggleUIRefresh] = useUIRefresh()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('/api/export/all')
      if (!response.ok) throw new Error('Export failed')

      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `travel-dreams-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Data exported successfully')
    } catch (error) {
      toast.error('Failed to export data')
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteAllData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete ALL your data? This action cannot be undone.'
    )

    if (!confirmed) return

    const doubleConfirm = window.confirm(
      'This will permanently delete all places, sources, and collections. Are you absolutely sure?'
    )

    if (!doubleConfirm) return

    setIsDeleting(true)
    try {
      const response = await fetch('/api/data/delete-all', { method: 'DELETE' })
      if (!response.ok) throw new Error('Delete failed')

      toast.success('All data deleted successfully')
      router.push('/')
      router.refresh()
    } catch (error) {
      toast.error('Failed to delete data')
      console.error('Delete error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClearCache = () => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
      sessionStorage.clear()
      setPreferences(DEFAULT_PREFERENCES)
      toast.success('Cache cleared successfully')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your preferences and app settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how Travel Dreams looks and feels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Theme</Label>
            {!mounted ? (
              <div className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Laptop className="h-4 w-4" />
                      <span>System</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Default Library View</Label>
            <Select
              value={preferences.defaultView}
              onValueChange={(value: 'grid' | 'list' | 'map') =>
                setPreferences({ ...preferences, defaultView: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4" />
                    <span>Grid</span>
                  </div>
                </SelectItem>
                <SelectItem value="list">
                  <div className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    <span>List</span>
                  </div>
                </SelectItem>
                <SelectItem value="map">
                  <div className="flex items-center gap-2">
                    <Map className="h-4 w-4" />
                    <span>Map</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Card Density</Label>
            <div className="flex gap-2">
              <Button
                variant={preferences.cardDensity === 'compact' ? 'default' : 'outline'}
                onClick={() => setPreferences({ ...preferences, cardDensity: 'compact' })}
                className="flex-1"
              >
                Compact
              </Button>
              <Button
                variant={preferences.cardDensity === 'comfortable' ? 'default' : 'outline'}
                onClick={() => setPreferences({ ...preferences, cardDensity: 'comfortable' })}
                className="flex-1"
              >
                Comfortable
              </Button>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <div className="flex items-center gap-2">
                <Label className="cursor-pointer" htmlFor="ui-refresh">
                  Tropical Boutique UI
                </Label>
                <Sparkles className="h-3.5 w-3.5 text-accent" />
              </div>
              <p className="text-sm text-muted-foreground">
                Modern UI with warm tropical colors, enhanced spacing, and refined components
              </p>
            </div>
            <Switch
              id="ui-refresh"
              checked={uiRefreshEnabled}
              onCheckedChange={toggleUIRefresh}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Processing</CardTitle>
          <CardDescription>
            Configure how the AI processes your uploads
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-process Uploads</Label>
              <p className="text-sm text-muted-foreground">
                Automatically extract places from uploaded screenshots
              </p>
            </div>
            <Button
              variant={preferences.autoProcessUploads ? 'default' : 'outline'}
              onClick={() =>
                setPreferences({
                  ...preferences,
                  autoProcessUploads: !preferences.autoProcessUploads,
                })
              }
            >
              {preferences.autoProcessUploads ? 'On' : 'Off'}
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Confidence Threshold</Label>
              <span className="text-sm text-muted-foreground">
                {preferences.confidenceThreshold}%
              </span>
            </div>
            <Slider
              value={[preferences.confidenceThreshold]}
              onValueChange={([value]) =>
                setPreferences({ ...preferences, confidenceThreshold: value })
              }
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Places with confidence above this threshold can be auto-confirmed
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data & Privacy</CardTitle>
          <CardDescription>
            Manage your data and privacy settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportData}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export All Data (JSON)'}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleClearCache}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Cache & Filters
          </Button>

          <Separator />

          <Button
            variant="destructive"
            className="w-full justify-start"
            onClick={handleDeleteAllData}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete All Data'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keyboard Shortcuts</CardTitle>
          <CardDescription>
            Learn keyboard shortcuts to navigate faster
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setShowKeyboardShortcuts(true)}
          >
            <Keyboard className="h-4 w-4 mr-2" />
            View Keyboard Shortcuts
          </Button>
        </CardContent>
      </Card>

      <KeyboardShortcutsDialog
        open={showKeyboardShortcuts}
        onOpenChange={setShowKeyboardShortcuts}
      />
    </div>
  )
}
