import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth-helpers'
import { requestOrigin, shareTokensOrNull } from '@/lib/phone-share-page'
import { PhoneShareGuide } from '@/components/share/phone-share-guide'

export const metadata: Metadata = {
  title: 'Share from your phone',
  description: 'Save TikTok and Instagram posts to your Inbox from the share sheet',
}

export default async function ShareFromPhonePage() {
  const user = await requireAuth()
  const [origin, tokens] = await Promise.all([requestOrigin(), shareTokensOrNull(user.id)])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Share from your phone</h1>
        <p className="mt-1 text-muted-foreground">
          Save TikTok and Instagram posts to your Inbox straight from the share sheet, without opening Travel Dream.
        </p>
      </div>
      <PhoneShareGuide endpoint={`${origin}/api/share/links`} appOrigin={origin} initialTokens={tokens} />
    </div>
  )
}
