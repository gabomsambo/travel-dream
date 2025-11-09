#!/bin/bash

###############################################################################
# UI Refresh Test Runner
#
# Runs all UI refresh related tests and generates a summary report
#
# Usage:
#   ./scripts/run-ui-refresh-tests.sh [--verbose] [--coverage]
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
VERBOSE=false
COVERAGE=false

for arg in "$@"; do
  case $arg in
    --verbose)
      VERBOSE=true
      shift
      ;;
    --coverage)
      COVERAGE=true
      shift
      ;;
    *)
      ;;
  esac
done

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         UI Refresh Integration Test Suite                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
START_TIME=$(date +%s)

###############################################################################
# Test 1: TypeScript Compilation
###############################################################################
echo -e "${YELLOW}[1/5] TypeScript Compilation Check...${NC}"

if npx tsc --noEmit 2>&1 | grep -q "Found 0 errors"; then
  echo -e "${GREEN}✓ TypeScript compilation passed${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ TypeScript compilation has errors${NC}"
  if [ "$VERBOSE" = true ]; then
    npx tsc --noEmit 2>&1 | head -20
  fi
  ((TESTS_FAILED++))
fi
echo ""

###############################################################################
# Test 2: Adapter Smoke Tests
###############################################################################
echo -e "${YELLOW}[2/5] Running Adapter Smoke Tests...${NC}"

if [ "$COVERAGE" = true ]; then
  TEST_COMMAND="npm test -- --coverage --testPathPattern=adapter-smoke-tests"
else
  TEST_COMMAND="npm test -- --testPathPattern=adapter-smoke-tests"
fi

if $TEST_COMMAND > /tmp/adapter-tests.log 2>&1; then
  echo -e "${GREEN}✓ Adapter smoke tests passed${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ Adapter smoke tests failed${NC}"
  if [ "$VERBOSE" = true ]; then
    tail -20 /tmp/adapter-tests.log
  fi
  ((TESTS_FAILED++))
fi
echo ""

###############################################################################
# Test 3: Feature Flag Tests
###############################################################################
echo -e "${YELLOW}[3/5] Running Feature Flag Tests...${NC}"

if npm test -- --testPathPattern=feature-flag > /tmp/flag-tests.log 2>&1; then
  echo -e "${GREEN}✓ Feature flag tests passed${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ Feature flag tests failed${NC}"
  if [ "$VERBOSE" = true ]; then
    tail -20 /tmp/flag-tests.log
  fi
  ((TESTS_FAILED++))
fi
echo ""

###############################################################################
# Test 4: Import Verification
###############################################################################
echo -e "${YELLOW}[4/5] Verifying Import Migration...${NC}"

# Check for any remaining direct UI imports (should be 0)
OLD_IMPORTS=$(grep -r "from ['\"]@/components/ui/" src/components/ --exclude-dir={ui,ui-v2,adapters} 2>/dev/null | wc -l | tr -d ' ')

if [ "$OLD_IMPORTS" -eq 0 ]; then
  echo -e "${GREEN}✓ No old UI imports found (migration complete)${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ Found $OLD_IMPORTS old UI imports (should be 0)${NC}"
  if [ "$VERBOSE" = true ]; then
    grep -r "from ['\"]@/components/ui/" src/components/ --exclude-dir={ui,ui-v2,adapters} | head -5
  fi
  ((TESTS_FAILED++))
fi
echo ""

###############################################################################
# Test 5: Build Verification
###############################################################################
echo -e "${YELLOW}[5/5] Running Production Build...${NC}"

if npm run build > /tmp/build.log 2>&1; then
  echo -e "${GREEN}✓ Production build successful${NC}"
  ((TESTS_PASSED++))

  # Check bundle size
  if [ -d ".next/static/chunks" ]; then
    BUNDLE_SIZE=$(du -sh .next/static/chunks | cut -f1)
    echo -e "  ${BLUE}Bundle size: $BUNDLE_SIZE${NC}"
  fi
else
  echo -e "${RED}✗ Production build failed${NC}"
  if [ "$VERBOSE" = true ]; then
    tail -30 /tmp/build.log
  fi
  ((TESTS_FAILED++))
fi
echo ""

###############################################################################
# Test Summary
###############################################################################
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "Total Tests:    ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed:         ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:         ${RED}$TESTS_FAILED${NC}"
echo -e "Duration:       ${BLUE}${DURATION}s${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✓ All tests passed! UI Refresh is ready for testing.   ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${BLUE}Next Steps:${NC}"
  echo -e "  1. Start dev server: ${YELLOW}npm run dev${NC}"
  echo -e "  2. Go to Settings: ${YELLOW}http://localhost:3000/settings${NC}"
  echo -e "  3. Enable 'Tropical Boutique UI' toggle"
  echo -e "  4. Follow ${YELLOW}VISUAL_TEST_GUIDE.md${NC} for manual testing"
  echo ""
  exit 0
else
  echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ✗ Some tests failed. Please review errors above.       ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo -e "  • Run with --verbose flag for detailed error logs"
  echo -e "  • Check test logs in /tmp/*.log"
  echo -e "  • Review ${YELLOW}INTEGRATION_TEST_PLAN.md${NC} for guidance"
  echo ""
  exit 1
fi
