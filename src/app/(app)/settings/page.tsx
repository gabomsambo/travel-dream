import { Metadata } from 'next'
import { SettingsClient } from '@/components/settings/settings-client'
import { PhoneShareSettingsCard } from '@/components/share/phone-share-settings-card'
import { requireAuth } from '@/lib/auth-helpers'
import { shareTokensOrNull } from '@/lib/phone-share-page'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your preferences and app settings',
}

export default async function SettingsPage() {
  const user = await requireAuth()
  const tokens = await shareTokensOrNull(user.id)
  return <SettingsClient phoneShare={<PhoneShareSettingsCard tokens={tokens} />} />
}
