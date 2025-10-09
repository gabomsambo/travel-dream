import { Metadata } from 'next'
import { SettingsClient } from '@/components/settings/settings-client'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your preferences and app settings',
}

export default function SettingsPage() {
  return <SettingsClient />
}
