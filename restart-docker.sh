#!/bin/bash

echo "🔄 Restarting Docker container with new OCR implementation..."

# Stop existing containers
docker-compose down

# Rebuild and start
docker-compose up --build -d

echo "✅ Container restarted!"
echo "📊 Following logs..."
docker-compose logs -f