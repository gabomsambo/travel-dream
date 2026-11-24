import Link from 'next/link'
import { ChevronRight, Smartphone } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/adapters/card'
import { ShareTokenManager } from '@/components/share/share-token-manager'
import type { ShareTokenSummary } from '@/types/share-tokens'

/** Settings section: personal share tokens, and the way to the phone setup steps. */
export function PhoneShareSettingsCard({ tokens }: { tokens: ShareTokenSummary[] | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share from your phone</CardTitle>
        <CardDescription>
          Share tokens let an iPhone Shortcut save TikTok and Instagram links to your Inbox. A token can only save
          links; revoke it here if a phone is lost.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Link
          href="/share-from-phone"
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50"
        >
          <span className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" aria-hidden />
            Set up sharing from iPhone, iPad or Android
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </Link>
        <ShareTokenManager initialTokens={tokens} defaultName="iPhone" />
      </CardContent>
    </Card>
  )
}
