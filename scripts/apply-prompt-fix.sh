#!/bin/bash

# Helper script to apply and test prompt fixes
# Usage: ./scripts/apply-prompt-fix.sh [a|b] [test|apply]

set -e

OPTION=$1
MODE=${2:-test}

if [[ ! "$OPTION" =~ ^[ab]$ ]]; then
  echo "Usage: $0 [a|b] [test|apply]"
  echo ""
  echo "Options:"
  echo "  a     Apply Option A (minimal conservative fix)"
  echo "  b     Apply Option B (signal hierarchy + list handling)"
  echo ""
  echo "Modes:"
  echo "  test   Preview changes without applying (default)"
  echo "  apply  Apply changes and run diagnostic test"
  echo ""
  echo "Examples:"
  echo "  $0 a test    # Preview Option A changes"
  echo "  $0 b apply   # Apply Option B and test"
  exit 1
fi

PATCH_FILE="option-${OPTION}-$([ "$OPTION" == "a" ] && echo "minimal" || echo "signal-hierarchy").patch"
VERSION=$([ "$OPTION" == "a" ] && echo "2.1.0" || echo "2.2.0")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Prompt Fix - Option $(echo $OPTION | tr 'a-z' 'A-Z')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$MODE" == "test" ]; then
  echo "📋 PREVIEW MODE - No changes will be applied"
  echo ""
  echo "Changes that would be applied:"
  echo ""
  git apply --check "$PATCH_FILE" 2>/dev/null && echo "✅ Patch is valid" || {
    echo "❌ Patch validation failed"
    exit 1
  }
  echo ""
  echo "View full diff:"
  cat "$PATCH_FILE"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "To apply these changes, run:"
  echo "  $0 $OPTION apply"
  echo ""

elif [ "$MODE" == "apply" ]; then
  echo "🚀 APPLY MODE - Changes will be made"
  echo ""

  # Backup current files
  echo "📦 Creating backup..."
  cp src/lib/llm-providers/anthropic-provider.ts src/lib/llm-providers/anthropic-provider.ts.backup
  cp src/lib/llm-providers/openai-provider.ts src/lib/llm-providers/openai-provider.ts.backup
  echo "✅ Backup created (.backup files)"
  echo ""

  # Apply patch
  echo "📝 Applying patch..."
  git apply "$PATCH_FILE"
  echo "✅ Patch applied"
  echo ""

  # Update version numbers
  echo "🔢 Updating prompt versions to $VERSION..."

  # For Anthropic provider
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/promptVersion = '[0-9.]*'/promptVersion = '$VERSION'/" src/lib/llm-providers/anthropic-provider.ts
    sed -i '' "s/promptVersion = '[0-9.]*'/promptVersion = '$VERSION'/" src/lib/llm-providers/openai-provider.ts
  else
    sed -i "s/promptVersion = '[0-9.]*'/promptVersion = '$VERSION'/" src/lib/llm-providers/anthropic-provider.ts
    sed -i "s/promptVersion = '[0-9.]*'/promptVersion = '$VERSION'/" src/lib/llm-providers/openai-provider.ts
  fi

  echo "✅ Version updated to $VERSION"
  echo ""

  # Run diagnostic test
  echo "🧪 Running diagnostic test..."
  echo ""
  npx tsx scripts/test-extraction-accuracy.ts
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Option $(echo $OPTION | tr 'a-z' 'A-Z') applied successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Review OCR_LLM_DIAGNOSTIC_REPORT.md for results"
  echo "  2. Compare against baseline (should be ≥93% extraction rate)"
  echo "  3. If satisfied: git add . && git commit -m 'feat: improve LLM extraction prompt (v$VERSION)'"
  echo "  4. If reverting: git checkout -- src/lib/llm-providers/*.ts"
  echo ""
  echo "Backups available at:"
  echo "  - src/lib/llm-providers/anthropic-provider.ts.backup"
  echo "  - src/lib/llm-providers/openai-provider.ts.backup"
  echo ""

else
  echo "❌ Invalid mode: $MODE"
  echo "Use 'test' or 'apply'"
  exit 1
fi
