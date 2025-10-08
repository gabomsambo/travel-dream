/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client'],
  env: {
    // Validate required environment variables at build time
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  },
  transpilePackages: ['leaflet', 'react-leaflet', 'react-leaflet-cluster'],
  // Ensure proper handling of SQLite/libSQL
  webpack: (config, { isServer }) => {
    // Handle SQLite dependencies
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });

    // Don't attempt to bundle Leaflet on server-side
    if (isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        'leaflet': false,
        'react-leaflet': false,
        'react-leaflet-cluster': false,
      };
    }

    return config;
  },
}

module.exports = nextConfig
