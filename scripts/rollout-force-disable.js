#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚨 EMERGENCY ROLLBACK: Disabling UI Refresh for all users');
console.log('─'.repeat(60));

const configPath = path.join(__dirname, '../src/lib/rollout-config.ts');

if (!fs.existsSync(configPath)) {
  console.error('❌ Error: rollout-config.ts not found at', configPath);
  process.exit(1);
}

let config = fs.readFileSync(configPath, 'utf8');

config = config.replace(/percentage:\s*\d+/, 'percentage: 0');
config = config.replace(/enabled:\s*true/, 'enabled: false');

fs.writeFileSync(configPath, config);

console.log('✅ Rollout config updated:');
console.log('   • percentage = 0');
console.log('   • enabled = false');
console.log('');
console.log('⚠️  Users will need to manually re-enable in Settings if desired');
console.log('📝 Audit log: Rollback executed at', new Date().toISOString());
console.log('');
console.log('Next steps:');
console.log('  1. Verify feature flag disabled in production');
console.log('  2. Monitor error rates');
console.log('  3. Investigate root cause');
console.log('  4. Fix issue in staging');
console.log('  5. Re-test thoroughly');
console.log('  6. Resume rollout with: npm run rollout:enable <percentage>');
console.log('');
console.log('🔄 Don\'t forget to commit this change and deploy!');
