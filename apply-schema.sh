#!/bin/bash
echo "Applying database schema..."
echo "Yes, I want to execute all statements" | docker-compose exec travel-dreams npx drizzle-kit push