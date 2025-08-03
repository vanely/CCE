#!/bin/bash
cd "$(dirname "$0")/local-service"
echo "🚀 Starting Claude Code Extractor Service..."
echo "📡 Service will be available at http://localhost:3030"
echo "🛑 Press Ctrl+C to stop"
echo ""
node server.js
