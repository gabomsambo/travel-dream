import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { InboxAction, InboxThumb } from '@/lib/inbox-page-model'

export function InboxActions({ actions }: { actions: InboxAction[] }) {
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((action) => {
        const className = cn(
          'inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-medium',
          action.warn
            ? 'border-amber-300 bg-background text-amber-800 dark:border-amber-700 dark:text-amber-200'
            : 'border-border bg-background text-foreground',
          action.disabled && 'cursor-not-allowed opacity-60'
        )
        if (action.href && !action.disabled) {
          return (
            <Link key={action.label} href={action.href} className={className}>
              {action.label}
            </Link>
          )
        }
        return (
          <button key={action.label} type="button" className={className} disabled={action.disabled}>
            {action.label}
          </button>
        )
      })}
    </div>
  )
}

export function ThumbStrip({
  thumbs,
  variant,
}: {
  thumbs: InboxThumb[]
  variant: 'hero' | 'card' | 'mini'
}) {
  if (thumbs.length === 0) return null
  return (
    <div className={cn('flex', variant === 'mini' && 'hidden md:flex')}>
      {thumbs.map((thumb, index) => (
        // Screenshots are the user's own blob URLs, same as the review postcard.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${thumb.src}-${index}`}
          src={thumb.src}
          alt={thumb.alt}
          className={cn(
            'rounded-md border-2 object-cover object-top',
            variant === 'hero'
              ? 'h-[76px] w-11 border-white shadow-md md:h-[100px] md:w-[58px]'
              : 'h-10 w-6 border-card md:h-14 md:w-[34px]',
            index > 0 && (variant === 'hero' ? '-ml-4' : '-ml-3'),
            variant === 'card' && index >= 3 && 'hidden md:block'
          )}
        />
      ))}
    </div>
  )
}
