#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

export PORT=5000
export NODE_ENV=production

echo "Starting server on port $PORT..."
pm2 start ecosystem.config.js
