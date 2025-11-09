#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const targetPercentage = parseInt(process.argv[2], 10);

if (isNaN(targetPercentage) || targetPercentage < 0 || targetPercentage > 100) {
  console.error('❌ Error: Please provide a valid percentage (0-100)');
  console.error('');
  console.error('Usage: npm run rollout:enable <percentage>');
  console.error('');
  console.error('Examples:');
  console.error('  npm run rollout:enable 10   # Enable for 10% of users (Alpha)');
  console.error('  npm run rollout:enable 25   # Enable for 25% of users (Beta)');
  console.error('  npm run rollout:enable 50   # Enable for 50% of users (Gamma)');
  console.error('  npm run rollout:enable 100  # Enable for 100% of users (Full)');
  process.exit(1);
}

console.log(`🚀 UI Refresh Rollout: Setting to ${targetPercentage}%`);
console.log('─'.repeat(60));

const configPath = path.join(__dirname, '../src/lib/rollout-config.ts');

if (!fs.existsSync(configPath)) {
  console.error('❌ Error: rollout-config.ts not found at', configPath);
  process.exit(1);
}

let config = fs.readFileSync(configPath, 'utf8');

config = config.replace(/percentage:\s*\d+/, `percentage: ${targetPercentage}`);
config = config.replace(/enabled:\s*false/, 'enabled: true');

fs.writeFileSync(configPath, config);

const phaseName =
  targetPercentage === 0 ? 'Disabled' :
  targetPercentage <= 10 ? 'Alpha' :
  targetPercentage <= 25 ? 'Beta' :
  targetPercentage <= 50 ? 'Gamma' :
  'Full Rollout';

console.log('✅ Rollout config updated:');
console.log(`   • percentage = ${targetPercentage}%`);
console.log('   • enabled = true');
console.log(`   • Phase: ${phaseName}`);
console.log('');

if (targetPercentage === 0) {
  console.log('⚠️  Feature is now disabled for all users');
} else {
  console.log(`📊 Approximately ${targetPercentage}% of users will see the feature`);
}

console.log('');
console.log('⏰ Updated at:', new Date().toISOString());
console.log('');

console.log('Monitoring checklist:');
console.log('  [ ] Error rate < 1%');
console.log('  [ ] Performance within baseline (+10% acceptable)');
console.log('  [ ] User feedback collected');
console.log('  [ ] No P0 bugs reported');
console.log('');

if (targetPercentage === 10) {
  console.log('📋 Alpha Phase (10%):');
  console.log('   • Duration: 2 days');
  console.log('   • Monitor: Error rate, P95 load time');
  console.log('   • Success: <1% errors, <3s load time');
} else if (targetPercentage === 25) {
  console.log('📋 Beta Phase (25%):');
  console.log('   • Duration: 3 days');
  console.log('   • Monitor: Error rate, adoption rate');
  console.log('   • Success: <1% errors, >50% adoption');
} else if (targetPercentage === 50) {
  console.log('📋 Gamma Phase (50%):');
  console.log('   • Duration: 3 days');
  console.log('   • Monitor: System performance, error rate');
  console.log('   • Success: <1% errors, no degradation');
} else if (targetPercentage === 100) {
  console.log('📋 Full Rollout (100%):');
  console.log('   • Duration: Ongoing');
  console.log('   • Monitor: Long-term stability');
  console.log('   • Success: 7 days stable, >50% adoption');
}

console.log('');
console.log('🔄 Don\'t forget to:');
console.log('  1. Commit this change');
console.log('  2. Deploy to production');
console.log('  3. Monitor dashboard for issues');
console.log('  4. Review after monitoring period');
