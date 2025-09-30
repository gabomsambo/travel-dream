#!/bin/bash

# Travel Dreams Collection - Docker Development Setup Script

set -e

echo "🚢 Setting up Travel Dreams Collection with Docker..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local from template..."
    cp .env.docker .env.local
    echo "⚠️  Please edit .env.local with your API keys before continuing:"
    echo "   - OPENAI_API_KEY (required)"
    echo "   - ANTHROPIC_API_KEY (required)"
    echo "   - TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (or use local SQLite)"
    echo ""
    read -p "Press Enter after updating .env.local to continue..."
fi

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

echo "📦 Installing dependencies..."
docker-compose exec travel-dreams npm install

# Initialize database if needed
echo "🗄️  Setting up database..."
if grep -q "file:./local.db" .env.local; then
    echo "📁 Using local SQLite database..."
    docker-compose exec travel-dreams npm run db:push
else
    echo "☁️  Using Turso cloud database..."
    docker-compose exec travel-dreams npm run db:migrate
fi

echo "✅ Setup complete!"
echo ""
echo "🌐 Application is running at: http://localhost:3000"
echo "📊 View logs: docker-compose logs -f travel-dreams"
echo "🛑 Stop services: docker-compose down"
echo ""
echo "📁 File changes will automatically reload the application."
echo "📸 Uploads are persisted in Docker volume 'uploads_data'"