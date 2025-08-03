#!/bin/bash
cd "$(dirname "$0")/local-service"
echo "🔧 Starting Claude Code Extractor Service in development mode..."
echo "📡 Service will be available at http://localhost:3030"
echo "🔄 Auto-restart enabled"
echo "🛑 Press Ctrl+C to stop"
echo ""
npm run dev
