/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client'],
  env: {
    // Validate required environment variables at build time
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  },
  // Ensure proper handling of SQLite/libSQL
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = nextConfig
