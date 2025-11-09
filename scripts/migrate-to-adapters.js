#!/usr/bin/env node

/**
 * Codemod: Migrate UI Imports to Adapters
 *
 * Automatically replaces imports from @/components/ui/* to @/components/adapters/*
 * for components that have adapters.
 *
 * Usage:
 *   node scripts/migrate-to-adapters.js [--dry-run] [path]
 *
 * Examples:
 *   node scripts/migrate-to-adapters.js --dry-run src/app
 *   node scripts/migrate-to-adapters.js src/components
 */

const fs = require('fs')
const path = require('path')

// Components with adapters
const ADAPTER_COMPONENTS = [
  'button',
  'card',
  'badge',
  'checkbox',
  'input',
  'label',
  'separator',
  'textarea',
  'switch',
  'dialog',
  'sheet',
  'tooltip',
  'scroll-area',
  'popover',
  'command',
  'select',
]

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const targetPath = args.find(arg => !arg.startsWith('--')) || 'src'

let filesProcessed = 0
let filesModified = 0
let importsReplaced = 0

function migrateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  let newContent = content
  let modified = false

  // Pattern: import { ... } from "@/components/ui/XXX"
  ADAPTER_COMPONENTS.forEach(component => {
    const importRegex = new RegExp(
      `from ['"]@/components/ui/${component}['"]`,
      'g'
    )

    if (importRegex.test(newContent)) {
      newContent = newContent.replace(
        importRegex,
        `from "@/components/adapters/${component}"`
      )
      modified = true
      importsReplaced++
    }
  })

  filesProcessed++

  if (modified) {
    filesModified++

    if (isDryRun) {
      console.log(`[DRY RUN] Would modify: ${filePath}`)
    } else {
      fs.writeFileSync(filePath, newContent, 'utf8')
      console.log(`✓ Modified: ${filePath}`)
    }
  }

  return modified
}

function walkDirectory(dir, excludeDirs = []) {
  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      // Skip excluded directories
      if (excludeDirs.some(exclude => filePath.includes(exclude))) {
        return
      }
      walkDirectory(filePath, excludeDirs)
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      migrateFile(filePath)
    }
  })
}

console.log('🔄 UI Import Migration to Adapters')
console.log('====================================\n')
console.log(`Mode: ${isDryRun ? 'DRY RUN (no files will be changed)' : 'LIVE'}`)
console.log(`Target: ${targetPath}`)
console.log(`Components: ${ADAPTER_COMPONENTS.length} adapters available\n`)

// Exclude directories
const excludeDirs = [
  'node_modules',
  '.next',
  'ui-sandbox',
  'src/components/ui', // Don't modify original UI components
  'src/components/ui-v2', // Don't modify v2 components
  'src/components/adapters', // Don't modify adapters themselves
]

console.log('Excluded paths:', excludeDirs.join(', '))
console.log('\nProcessing...\n')

walkDirectory(targetPath, excludeDirs)

console.log('\n====================================')
console.log('Migration Summary:')
console.log(`Files processed: ${filesProcessed}`)
console.log(`Files modified: ${filesModified}`)
console.log(`Imports replaced: ${importsReplaced}`)

if (isDryRun) {
  console.log('\n⚠️  This was a DRY RUN. No files were changed.')
  console.log('   Remove --dry-run flag to apply changes.')
} else {
  console.log('\n✅ Migration complete!')
}

process.exit(0)
