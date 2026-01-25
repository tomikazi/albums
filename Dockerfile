# Multi-stage build for optimal caching
# Stage 1: Base image with all dependencies (cached unless dependencies change)
FROM python:3.11-slim-bullseye AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Pillow can fall back to source builds on ARM; install minimal build deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg62-turbo-dev \
    zlib1g-dev \
  && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel && \
    python -m pip install --no-cache-dir \
      "fastapi>=0.115.0" \
      "uvicorn[standard]>=0.30.0" \
      "pillow>=10.4.0" \
      "python-multipart>=0.0.9"

# Stage 2: Application image (only this layer rebuilds when code changes)
FROM base

# Copy application code last (changes frequently)
# This layer is rebuilt only when app code changes.
COPY app /app/app

EXPOSE 8080

ENV ALBUMS_SOURCE_DIR=/photos/albums \
    CACHE_DIR=/cache \
    USERS_FILE=/config/users.txt \
    PORT=8080 \
    ROOT_PATH=""

CMD ["python", "-m", "app.server"]

