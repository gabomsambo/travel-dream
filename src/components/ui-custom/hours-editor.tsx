"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/adapters/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

const DAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
] as const

type DayKey = typeof DAYS[number]['key']

interface TimeRange {
  id: string
  days: DayKey[]
  startTime: string
  endTime: string
  isClosed: boolean
}

interface HoursEditorProps {
  value: Record<string, string> | null
  onChange: (hours: Record<string, string> | null) => void
}

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const h24 = hour.toString().padStart(2, '0')
      const m = min.toString().padStart(2, '0')
      const value = `${h24}:${m}`

      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
      const ampm = hour < 12 ? 'AM' : 'PM'
      const label = `${h12}:${m} ${ampm}`

      options.push({ value, label })
    }
  }
  return options
}

const TIME_OPTIONS = generateTimeOptions()

function parseHoursToRanges(hours: Record<string, string> | null): TimeRange[] {
  if (!hours || Object.keys(hours).length === 0) {
    return [{
      id: crypto.randomUUID(),
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      startTime: '09:00',
      endTime: '17:00',
      isClosed: false,
    }]
  }

  const timeGroups = new Map<string, DayKey[]>()
  const closedDays: DayKey[] = []

  for (const [day, time] of Object.entries(hours)) {
    const dayKey = day.toLowerCase() as DayKey
    if (!DAYS.some(d => d.key === dayKey)) continue

    if (time.toLowerCase() === 'closed') {
      closedDays.push(dayKey)
    } else {
      const normalizedTime = normalizeTimeString(time)
      if (!timeGroups.has(normalizedTime)) {
        timeGroups.set(normalizedTime, [])
      }
      timeGroups.get(normalizedTime)!.push(dayKey)
    }
  }

  const ranges: TimeRange[] = []

  for (const [timeStr, days] of timeGroups) {
    const [start, end] = timeStr.split('-')
    ranges.push({
      id: crypto.randomUUID(),
      days: sortDays(days),
      startTime: start || '09:00',
      endTime: end || '17:00',
      isClosed: false,
    })
  }

  if (closedDays.length > 0) {
    ranges.push({
      id: crypto.randomUUID(),
      days: sortDays(closedDays),
      startTime: '09:00',
      endTime: '17:00',
      isClosed: true,
    })
  }

  return ranges.length > 0 ? ranges : [{
    id: crypto.randomUUID(),
    days: [],
    startTime: '09:00',
    endTime: '17:00',
    isClosed: false,
  }]
}

function normalizeTimeString(time: string): string {
  const parts = time.split('-').map(t => {
    const cleaned = t.trim().replace(/\s+/g, '')
    if (cleaned.includes(':')) {
      const [h, m] = cleaned.split(':')
      return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
    }
    return `${cleaned.padStart(2, '0')}:00`
  })
  return parts.join('-')
}

function sortDays(days: DayKey[]): DayKey[] {
  const order: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  return days.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

function rangesToHours(ranges: TimeRange[]): Record<string, string> | null {
  const hours: Record<string, string> = {}

  for (const range of ranges) {
    for (const day of range.days) {
      if (range.isClosed) {
        hours[day] = 'closed'
      } else {
        hours[day] = `${range.startTime}-${range.endTime}`
      }
    }
  }

  return Object.keys(hours).length > 0 ? hours : null
}

export function HoursEditor({ value, onChange }: HoursEditorProps) {
  const [ranges, setRanges] = useState<TimeRange[]>(() => parseHoursToRanges(value))

  const updateOutput = useCallback((newRanges: TimeRange[]) => {
    setRanges(newRanges)
    onChange(rangesToHours(newRanges))
  }, [onChange])

  useEffect(() => {
    if (value === null && ranges.length === 1 && ranges[0].days.length === 0) {
      return
    }
  }, [value, ranges])

  const toggleDay = (rangeId: string, day: DayKey) => {
    const newRanges = ranges.map(range => {
      if (range.id !== rangeId) {
        return { ...range, days: range.days.filter(d => d !== day) }
      }

      const hasDayInOtherRange = ranges.some(r => r.id !== rangeId && r.days.includes(day))

      if (range.days.includes(day)) {
        return { ...range, days: range.days.filter(d => d !== day) }
      } else {
        const otherRangesUpdated = ranges
          .filter(r => r.id !== rangeId)
          .map(r => ({ ...r, days: r.days.filter(d => d !== day) }))

        return { ...range, days: sortDays([...range.days, day]) }
      }
    })

    const cleanedRanges = newRanges.map(range => {
      if (range.id === rangeId) return range
      return { ...range, days: range.days.filter(d => !newRanges.find(r => r.id === rangeId)?.days.includes(d)) }
    })

    updateOutput(cleanedRanges)
  }

  const updateTime = (rangeId: string, field: 'startTime' | 'endTime', value: string) => {
    const newRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, [field]: value } : range
    )
    updateOutput(newRanges)
  }

  const toggleClosed = (rangeId: string) => {
    const newRanges = ranges.map(range =>
      range.id === rangeId ? { ...range, isClosed: !range.isClosed } : range
    )
    updateOutput(newRanges)
  }

  const addRange = () => {
    const usedDays = new Set(ranges.flatMap(r => r.days))
    const availableDays = DAYS.map(d => d.key).filter(d => !usedDays.has(d))

    const newRange: TimeRange = {
      id: crypto.randomUUID(),
      days: availableDays.length > 0 ? [availableDays[0]] : [],
      startTime: '09:00',
      endTime: '17:00',
      isClosed: false,
    }
    updateOutput([...ranges, newRange])
  }

  const removeRange = (rangeId: string) => {
    const newRanges = ranges.filter(r => r.id !== rangeId)
    updateOutput(newRanges.length > 0 ? newRanges : [{
      id: crypto.randomUUID(),
      days: [],
      startTime: '09:00',
      endTime: '17:00',
      isClosed: false,
    }])
  }

  const usedDays = new Set(ranges.flatMap(r => r.days))
  const allDaysUsed = usedDays.size === 7

  return (
    <div className="space-y-3">
      {ranges.map((range) => (
        <div
          key={range.id}
          className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-muted/30"
        >
          <div className="flex flex-wrap gap-1 flex-1 min-w-[200px]">
            {DAYS.map(({ key, label }) => {
              const isSelected = range.days.includes(key)
              const isUsedElsewhere = !isSelected && ranges.some(r => r.id !== range.id && r.days.includes(key))

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(range.id, key)}
                  disabled={isUsedElsewhere}
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isUsedElsewhere
                      ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                      : "bg-background border hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Switch
                checked={range.isClosed}
                onCheckedChange={() => toggleClosed(range.id)}
                className="scale-75"
              />
              <span className="text-xs text-muted-foreground">Closed</span>
            </div>
          </div>

          {!range.isClosed && (
            <div className="flex items-center gap-1">
              <Select
                value={range.startTime}
                onValueChange={(v) => updateTime(range.id, 'startTime', v)}
              >
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-muted-foreground">-</span>

              <Select
                value={range.endTime}
                onValueChange={(v) => updateTime(range.id, 'endTime', v)}
              >
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {range.isClosed && (
            <div className="text-sm text-muted-foreground italic">
              Closed
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeRange(range.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {!allDaysUsed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRange}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add time range
        </Button>
      )}
    </div>
  )
}
