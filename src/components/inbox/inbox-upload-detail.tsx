'use client'

import { useState } from 'react'
import Link from 'next/link'
import { InboxActions } from '@/components/inbox/inbox-actions'
import type { InboxChip, InboxShotRow } from '@/lib/inbox-page-model'

export function InboxUploadDetail({ chips, rows }: { chips: InboxChip[]; rows: InboxShotRow[] }) {
  const [filter, setFilter] = useState('all')
  const visible = filter === 'all' ? rows : rows.filter((row) => row.kind === filter)

  return (
    <>
      {chips.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="toolbar" aria-label="Filter screenshots">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
              className={
                filter === chip.id
                  ? 'rounded-full border border-foreground bg-foreground px-3 py-1 text-xs font-medium text-background'
                  : 'rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground'
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      <article className="overflow-hidden rounded-2xl border border-border bg-card">
        {visible.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0 md:grid-cols-[64px_minmax(0,1fr)_auto] md:gap-4 md:px-5"
          >
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.imageUrl}
                alt={row.alt}
                className="h-[86px] w-[52px] rounded-lg border border-border object-cover object-top md:h-[104px] md:w-16"
              />
            ) : (
              <div className="grid h-[86px] w-[52px] place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground md:h-[104px] md:w-16">
                No photo
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold">{row.title}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">{row.line}</p>
              {row.places.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.places.map((place) => (
                    <Link
                      key={place.id}
                      href={`/place/${place.id}`}
                      className={
                        place.inLibrary
                          ? 'rounded-lg border border-emerald-600/30 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300'
                          : 'rounded-lg border border-border bg-background px-2 py-0.5 text-xs'
                      }
                    >
                      {place.inLibrary ? `✓ ${place.name}` : place.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="col-start-2 md:col-start-auto">
              <InboxActions actions={row.actions} />
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground">No screenshots in this filter.</p>
        )}
      </article>
    </>
  )
}
