const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client'],
  // Right-sized photos: `src/components/photo.tsx` sends Blob, Pexels and
  // Wikimedia photos through the optimizer; `src/lib/photo-url.ts` keeps the same
  // host list. Google photos never come here: the resolver URL is the whole
  // reference, and the optimizer's cache would persist Google image bytes.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'thumb.wikimedia.org' },
    ],
    // A photo's URL keeps its bytes (only a retried thumbnail is overwritten), so a resized copy can live a month.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    imageSizes: [96, 160, 256, 384],
    deviceSizes: [480, 640, 828, 1080, 1440, 1920],
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = withBundleAnalyzer(nextConfig)
