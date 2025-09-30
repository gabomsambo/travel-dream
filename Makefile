# Travel Dreams Collection - Docker Development

.PHONY: help setup dev dev-build down logs shell clean

help: ## Show this help message
	@echo "Travel Dreams Collection - Docker Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Initial Docker setup with environment configuration
	@echo "🚢 Setting up Travel Dreams Collection with Docker..."
	./scripts/docker-dev.sh

dev: ## Start development environment
	@echo "🚀 Starting development environment..."
	docker-compose up

dev-build: ## Rebuild and start development environment
	@echo "🔨 Rebuilding and starting development environment..."
	docker-compose up --build

down: ## Stop all services
	@echo "🛑 Stopping all services..."
	docker-compose down

logs: ## View application logs
	@echo "📊 Viewing application logs..."
	docker-compose logs -f travel-dreams

shell: ## Access container shell
	@echo "🐚 Accessing container shell..."
	docker-compose exec travel-dreams sh

clean: ## Clean up Docker resources
	@echo "🧹 Cleaning up Docker resources..."
	docker-compose down -v
	docker system prune -f

status: ## Show service status
	@echo "📊 Service status:"
	docker-compose ps