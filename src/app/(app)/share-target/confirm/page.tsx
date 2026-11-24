import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth-helpers'
import { extractSharedUrl } from '@/lib/link-import/shared-url'

export const metadata: Metadata = { title: 'Save shared link' }

interface ConfirmPageProps {
  searchParams: Promise<{ url?: string | string[] }>
}

/**
 * Shown when `/share-target` was reached by something other than the share
 * sheet itself (see that route). One tap saves: the form goes back to
 * `/share-target` from this site, which the route accepts.
 */
export default async function ShareTargetConfirmPage({ searchParams }: ConfirmPageProps) {
  await requireAuth()
  const raw = (await searchParams).url
  const url = extractSharedUrl({ url: Array.isArray(raw) ? raw[0] : raw })

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight">Save this link to your Inbox?</h1>
        {url ? (
          <>
            <p className="mt-3 break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs sm:text-sm">{url}</p>
            <form action="/share-target" method="GET" className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="url" value={url} />
              <button
                type="submit"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Save to Inbox
              </button>
              <Link
                href="/inbox"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
              >
                Cancel
              </Link>
            </form>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">There is no link to save here.</p>
            <Link href="/inbox" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary">
              Go to Inbox
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
