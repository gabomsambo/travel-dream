# Development Dockerfile for Travel Dreams Collection
FROM node:18-alpine

# Install necessary system dependencies for Sharp, Tesseract, and image processing
RUN apk add --no-cache \
    libc6-compat \
    vips-dev \
    fribidi-dev \
    harfbuzz-dev \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    python3 \
    make \
    g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Create all upload directories with proper structure and permissions
# Source uploads (screenshots and thumbnails)
RUN mkdir -p public/uploads/screenshots && \
    mkdir -p public/uploads/thumbnails && \
    # Place attachments and thumbnails (dynamic per-place subdirectories created at runtime)
    mkdir -p public/uploads/places && \
    # Set permissions
    chmod -R 755 public/uploads

# Expose port
EXPOSE 3000

# Start development server with hot reloading
CMD ["npm", "run", "dev"]