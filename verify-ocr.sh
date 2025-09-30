#!/bin/bash

echo "🔍 Verifying OCR Setup in Docker..."

# Check if container is running
if ! docker-compose ps | grep -q "travel-dreams.*Up"; then
    echo "❌ Docker container not running. Start with: docker-compose up"
    exit 1
fi

echo "✅ Docker container is running"

# Check if tesseract is available in container
echo ""
echo "📦 Checking tesseract installation..."
docker-compose exec -T travel-dreams tesseract --version | head -2

if [ $? -eq 0 ]; then
    echo "✅ Tesseract is installed and available"
else
    echo "❌ Tesseract not found in container"
    exit 1
fi

# Check if node modules are installed
echo ""
echo "📦 Checking Node.js packages..."
docker-compose exec -T travel-dreams ls node_modules/sharp > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ sharp package installed"
else
    echo "❌ sharp package missing"
fi

# Check if uploads directory exists
echo ""
echo "📁 Checking uploads directory..."
docker-compose exec -T travel-dreams ls public/uploads/screenshots > /dev/null 2>&1
if [ $? -eq 0 ]; then
    FILE_COUNT=$(docker-compose exec -T travel-dreams sh -c 'ls -1 public/uploads/screenshots/*.png 2>/dev/null | wc -l' | tr -d ' ')
    echo "✅ Uploads directory exists with $FILE_COUNT PNG files"
else
    echo "⚠️  Uploads directory empty or doesn't exist"
fi

echo ""
echo "🎯 OCR Setup Verification Complete!"
echo ""
echo "Next steps:"
echo "1. Upload a screenshot through the UI at http://localhost:3000"
echo "2. Watch logs with: docker-compose logs -f | grep OCR"
echo "3. Check for successful text extraction"