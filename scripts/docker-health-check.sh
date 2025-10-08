#!/bin/bash

# Docker Health Check Script for Travel Dreams Collection
# Verifies all services and dependencies are working correctly

set -e

echo "🔍 Docker Health Check Starting..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
echo "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Check if docker-compose is available
echo "Checking docker-compose..."
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ docker-compose is available${NC}"
echo ""

# Check if .env.local exists
echo "Checking environment configuration..."
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠ .env.local not found${NC}"
    echo "  Creating from .env.docker template..."
    cp .env.docker .env.local
    echo -e "${YELLOW}  Please edit .env.local with your credentials${NC}"
else
    echo -e "${GREEN}✓ .env.local exists${NC}"
fi
echo ""

# Check if services are running
echo "Checking services status..."
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ Services are running${NC}"

    # Check travel-dreams app
    if docker-compose ps travel-dreams | grep -q "Up"; then
        echo -e "${GREEN}  ✓ travel-dreams app is running${NC}"
    else
        echo -e "${YELLOW}  ⚠ travel-dreams app is not running${NC}"
    fi

    # Check redis
    if docker-compose ps redis | grep -q "Up"; then
        echo -e "${GREEN}  ✓ redis is running${NC}"
    else
        echo -e "${YELLOW}  ⚠ redis is not running${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Services are not running${NC}"
    echo "  Start with: npm run docker:dev"
fi
echo ""

# Check upload directories
echo "Checking upload directories..."
DIRS=("public/uploads" "public/uploads/screenshots" "public/uploads/thumbnails" "public/uploads/places")
ALL_EXIST=true

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}  ✓ $dir exists${NC}"
    else
        echo -e "${YELLOW}  ⚠ $dir does not exist (will be created on container start)${NC}"
        ALL_EXIST=false
    fi
done
echo ""

# Check volumes
echo "Checking Docker volumes..."
if docker volume ls | grep -q "travel-dreams.*uploads_data"; then
    echo -e "${GREEN}✓ uploads_data volume exists${NC}"
else
    echo -e "${YELLOW}⚠ uploads_data volume not found (will be created on first start)${NC}"
fi

if docker volume ls | grep -q "travel-dreams.*redis_data"; then
    echo -e "${GREEN}✓ redis_data volume exists${NC}"
else
    echo -e "${YELLOW}⚠ redis_data volume not found (will be created on first start)${NC}"
fi
echo ""

# Test app responsiveness (if running)
echo "Testing application responsiveness..."
if docker-compose ps travel-dreams | grep -q "Up"; then
    if curl -s -f http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Application is responding on http://localhost:3000${NC}"
    else
        echo -e "${YELLOW}⚠ Application not responding (may still be starting up)${NC}"
        echo "  Check logs with: npm run docker:logs"
    fi
else
    echo -e "${YELLOW}⚠ Application not running${NC}"
fi
echo ""

# Check required dependencies in container (if running)
if docker-compose ps travel-dreams | grep -q "Up"; then
    echo "Checking container dependencies..."

    # Check Sharp dependencies
    if docker-compose exec -T travel-dreams sh -c "apk info | grep vips" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Sharp/VIPS installed${NC}"
    else
        echo -e "${RED}  ❌ Sharp/VIPS not installed${NC}"
    fi

    # Check Tesseract
    if docker-compose exec -T travel-dreams sh -c "which tesseract" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Tesseract OCR installed${NC}"
    else
        echo -e "${RED}  ❌ Tesseract not installed${NC}"
    fi

    # Check Node version
    NODE_VERSION=$(docker-compose exec -T travel-dreams node --version 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  ✓ Node.js ${NODE_VERSION}${NC}"
    fi

    echo ""
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Health Check Complete!${NC}"
echo ""
echo "Next steps:"
if ! docker-compose ps | grep -q "Up"; then
    echo "  1. Start services: npm run docker:dev"
fi
echo "  2. View logs: npm run docker:logs"
echo "  3. Open app: http://localhost:3000"
echo "  4. See full guide: DOCKER.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
