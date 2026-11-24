"use client"

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/adapters/button'
import { cn } from '@/lib/utils'

/** A read-only value with a Copy button, for pasting into the Shortcuts app. */
export function CopyField({
  value,
  label,
  className,
}: {
  value: string
  /** Accessible name for the value and its button, e.g. "Shortcut URL". */
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={cn('flex min-w-0 items-stretch gap-2', className)}>
      <code
        aria-label={label}
        className="min-w-0 flex-1 break-all rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs leading-5 sm:text-sm"
      >
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="h-auto min-h-10 shrink-0"
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        <span className="ml-1.5">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  )
}
