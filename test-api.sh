#!/bin/bash

# Travel Dreams API Test Script
echo "🧪 Testing Travel Dreams API endpoints..."
echo "Base URL: http://localhost:3000"
echo ""

# Test 1: Basic health check
echo "1. Testing basic application health..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$response" = "200" ] || [ "$response" = "307" ]; then
    echo "✅ Application responding (HTTP $response)"
else
    echo "❌ Application not responding (HTTP $response)"
fi

# Test 2: Database connection via sources API
echo ""
echo "2. Testing database connection..."
sources_response=$(curl -s -w "%{http_code}" http://localhost:3000/api/sources)
sources_code=$(echo "$sources_response" | tail -n1)
if [ "$sources_code" = "200" ]; then
    echo "✅ Database API responding (HTTP $sources_code)"
    echo "   Response: $(echo "$sources_response" | head -n1)"
else
    echo "❌ Database API error (HTTP $sources_code)"
fi

# Test 3: Upload session API
echo ""
echo "3. Testing upload session API..."
session_response=$(curl -s -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"fileCount": 1}' \
    http://localhost:3000/api/upload-session)
session_code=$(echo "$session_response" | tail -n1)
if [ "$session_code" = "200" ]; then
    echo "✅ Upload session API working (HTTP $session_code)"
    echo "   Response: $(echo "$session_response" | head -n1)"
else
    echo "❌ Upload session API error (HTTP $session_code)"
fi

# Test 4: LLM Provider Test (requires API keys)
echo ""
echo "4. Testing LLM provider connection..."
llm_response=$(curl -s -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"text": "test extraction", "contextType": "screenshot"}' \
    http://localhost:3000/api/llm-process)
llm_code=$(echo "$llm_response" | tail -n1)
if [ "$llm_code" = "200" ]; then
    echo "✅ LLM API working (HTTP $llm_code)"
    echo "   Response: $(echo "$llm_response" | head -n1 | cut -c1-100)..."
elif [ "$llm_code" = "400" ] || [ "$llm_code" = "401" ]; then
    echo "⚠️  LLM API reached but needs valid request/keys (HTTP $llm_code)"
else
    echo "❌ LLM API error (HTTP $llm_code)"
fi

# Test 5: Frontend pages
echo ""
echo "5. Testing frontend pages..."
for page in "inbox" "library" "collections" "review"; do
    page_response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$page)
    if [ "$page_response" = "200" ]; then
        echo "✅ /$page page loads (HTTP $page_response)"
    else
        echo "❌ /$page page error (HTTP $page_response)"
    fi
done

echo ""
echo "🎯 Test Summary Complete!"
echo "Visit http://localhost:3000 to use the application"