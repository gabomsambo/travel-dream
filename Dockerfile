# Development Dockerfile for Travel Dreams Collection
FROM node:18-alpine

# Install necessary system dependencies for Sharp and Tesseract
RUN apk add --no-cache \
    libc6-compat \
    vips-dev \
    tesseract-ocr \
    tesseract-ocr-data-eng

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Create uploads directory and set permissions
RUN mkdir -p public/uploads && chmod 755 public/uploads

# Expose port
EXPOSE 3000

# Start development server with hot reloading
CMD ["npm", "run", "dev"]