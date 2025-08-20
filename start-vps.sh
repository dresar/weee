#!/bin/bash

# VPS Startup Script for Bot KKN
echo "🚀 Starting Bot KKN for VPS..."

# Set environment variables for production
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Stop existing processes
echo "🛑 Stopping existing processes..."
pm2 stop bot-kkn 2>/dev/null || true
pm2 delete bot-kkn 2>/dev/null || true

# Clean up memory
echo "🧹 Cleaning up memory..."
sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

# Start the bot with PM2
echo "▶️ Starting bot with PM2..."
pm2 start ecosystem.config.js

# Show status
pm2 status
pm2 logs bot-kkn --lines 20

echo "✅ Bot KKN started successfully!"
echo "📊 Use 'pm2 status' to check status"
echo "📝 Use 'pm2 logs bot-kkn' to view logs"
echo "🔄 Use 'pm2 restart bot-kkn' to restart"
echo "🛑 Use 'pm2 stop bot-kkn' to stop"