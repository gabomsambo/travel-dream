#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const envLocalContent = `# Turso Database Configuration
# Replace with your actual Turso database URL and auth token
# Get these by running:
# turso db create travel-dreams
# turso db show travel-dreams --url
# turso db tokens create travel-dreams -e none

TURSO_DATABASE_URL=libsql://[DATABASE_NAME]-[YOUR_USERNAME].turso.io
TURSO_AUTH_TOKEN=your_auth_token_here

# Development settings
NODE_ENV=development`;

const envExampleContent = `# Turso Database Configuration
# Copy this file to .env.local and fill in your actual values

# Turso Database URL - Get from: turso db show [db-name] --url
TURSO_DATABASE_URL=libsql://[DATABASE_NAME]-[YOUR_USERNAME].turso.io

# Turso Auth Token - Get from: turso db tokens create [db-name] -e none
TURSO_AUTH_TOKEN=your_auth_token_here

# Environment
NODE_ENV=development

# Setup Instructions:
# 1. Install Turso CLI: curl -sSfL https://get.tur.so/install.sh | bash
# 2. Login: turso auth login
# 3. Create database: turso db create travel-dreams
# 4. Get URL: turso db show travel-dreams --url
# 5. Create token: turso db tokens create travel-dreams -e none
# 6. Copy this file to .env.local and fill in the values above`;

// Create .env.example
fs.writeFileSync('.env.example', envExampleContent);
console.log('✅ Created .env.example');

// Create .env.local if it doesn't exist
if (!fs.existsSync('.env.local')) {
  fs.writeFileSync('.env.local', envLocalContent);
  console.log('✅ Created .env.local template');
  console.log('⚠️  Please edit .env.local with your actual Turso credentials');
} else {
  console.log('ℹ️  .env.local already exists, skipping');
}

console.log('\n📋 Next steps:');
console.log('1. Install Turso CLI: curl -sSfL https://get.tur.so/install.sh | bash');
console.log('2. Login: turso auth login');
console.log('3. Create database: turso db create travel-dreams');
console.log('4. Get URL: turso db show travel-dreams --url');
console.log('5. Create token: turso db tokens create travel-dreams -e none');
console.log('6. Update .env.local with your actual values');
