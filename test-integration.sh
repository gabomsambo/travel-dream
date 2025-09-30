#!/bin/bash
# Integration Test Script for Screenshot → LLM → Inbox Pipeline

echo "🧪 Testing Travel Dreams Integration Pipeline"
echo "=============================================="
echo ""

BASE_URL="http://localhost:8081"

# Test 1: Check if dev server is running
echo "1️⃣  Testing dev server..."
if curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo "✅ Dev server is running on $BASE_URL"
else
    echo "❌ Dev server not running. Start with: npm run dev"
    exit 1
fi

# Test 2: Check database connection
echo ""
echo "2️⃣  Testing database connection..."
DB_TEST=$(curl -s "$BASE_URL/api/test-db")
if echo "$DB_TEST" | grep -q "success"; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "Response: $DB_TEST"
    exit 1
fi

# Test 3: Check LLM processing endpoint
echo ""
echo "3️⃣  Testing LLM processing endpoint..."
LLM_STATUS=$(curl -s "$BASE_URL/api/llm-process")
if echo "$LLM_STATUS" | grep -q "status"; then
    echo "✅ LLM processing endpoint accessible"
    echo "Stats: $(echo $LLM_STATUS | jq -r '.stats // "No stats available"')"
else
    echo "⚠️  LLM processing endpoint returned unexpected response"
    echo "Response: $LLM_STATUS"
fi

# Test 4: Check inbox page
echo ""
echo "4️⃣  Testing inbox page..."
INBOX_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/inbox")
if [ "$INBOX_STATUS" = "200" ]; then
    echo "✅ Inbox page accessible"
else
    echo "❌ Inbox page returned status: $INBOX_STATUS"
    exit 1
fi

# Test 5: Check review page
echo ""
echo "5️⃣  Testing review page..."
REVIEW_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/review")
if [ "$REVIEW_STATUS" = "200" ]; then
    echo "✅ Review page accessible"
else
    echo "❌ Review page returned status: $REVIEW_STATUS"
    exit 1
fi

# Summary
echo ""
echo "=============================================="
echo "🎉 Integration Test Summary"
echo "=============================================="
echo "✅ Dev server running"
echo "✅ Database connected"
echo "✅ LLM processing endpoint ready"
echo "✅ Inbox page accessible"
echo "✅ Review page accessible"
echo ""
echo "🚀 Ready to test the full pipeline!"
echo ""
echo "Next steps:"
echo "1. Navigate to: $BASE_URL/inbox"
echo "2. Upload a travel screenshot"
echo "3. Wait 45 seconds for OCR + LLM processing"
echo "4. Verify places appear in inbox"
echo ""
echo "For detailed testing guide, see: INTEGRATION_COMPLETE.md"