"use client"

import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"

interface HoursEditorProps {
  value: Record<string, string> | null
  onChange: (hours: Record<string, string> | null) => void
}

export function HoursEditor({ value, onChange }: HoursEditorProps) {
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value

    if (!text.trim()) {
      onChange(null)
      setError(null)
      return
    }

    try {
      const parsed = JSON.parse(text)
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        onChange(parsed)
        setError(null)
      } else {
        setError('Must be a JSON object')
      }
    } catch (err) {
      setError('Invalid JSON format')
    }
  }

  const displayValue = value ? JSON.stringify(value, null, 2) : ''

  return (
    <div>
      <Textarea
        value={displayValue}
        onChange={handleChange}
        placeholder='{"monday": "9:00-17:00", "tuesday": "9:00-17:00"}'
        rows={6}
        className={error ? 'border-red-500' : ''}
      />
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        Enter as JSON object. Example: {`{"monday": "9:00-17:00", "closed": ["sunday"]}`}
      </p>
    </div>
  )
}
