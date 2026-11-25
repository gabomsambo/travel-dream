import type { MetadataRoute } from 'next'

/**
 * Web app manifest, served at /manifest.webmanifest. It makes Travel Dream
 * installable from Chrome on Android and desktop, and registers the installed
 * app as a share target: sharing a TikTok or Instagram post to it opens
 * `/share-target` (see that route for how the link is saved).
 *
 * Safari ignores `share_target`; iPhone sharing goes through the Shortcut on
 * /share-from-phone instead. No service worker: Chrome no longer needs one to
 * install, and authenticated pages must never sit in an offline cache.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tabi Dreams',
    short_name: 'Tabi Dreams',
    description: 'A calm, visual place to store your travel ideas.',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    background_color: '#FFFCF5',
    theme_color: '#FFFCF5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {
      action: '/share-target',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  }
}
