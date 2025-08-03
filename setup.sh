#!/bin/bash
# setup.sh

echo "🚀 Setting up Claude Code Extractor..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ required. Current version: $(node --version)"
    echo "   Please update Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Install dependencies
echo "📦 Installing dependencies..."
cd local-service
npm install

# what does this condition mean?
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create service script
# echo "📝 Creating service startup script..."
# cat > ../start-service.sh << 'EOFINNER'
# #!/bin/bash
# cd "$(dirname "$0")/local-service"
# echo "🚀 Starting Claude Code Extractor Service..."
# echo "📡 Service will be available at http://localhost:3030"
# echo "🛑 Press Ctrl+C to stop"
# echo ""
# node server.js
# EOFINNER

# chmod +x ../start-service.sh

# # Create development script
# cat > ../start-dev.sh << 'EOFINNER'
# #!/bin/bash
# cd "$(dirname "$0")/local-service"
# echo "🔧 Starting Claude Code Extractor Service in development mode..."
# echo "📡 Service will be available at http://localhost:3030"
# echo "🔄 Auto-restart enabled"
# echo "🛑 Press Ctrl+C to stop"
# echo ""
# npm run dev
# EOFINNER

# chmod +x ../start-dev.sh

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Load the browser extension:"
echo "      - Open Chrome/Edge"
echo "      - Go to chrome://extensions/"
echo "      - Enable 'Developer mode'"
echo "      - Click 'Load unpacked'"
echo "      - Select the 'browser-extension' folder"
echo ""
echo "   2. Start the local service:"
echo "      ./start-service.sh"
echo ""
echo "   3. Configure the extension:"
echo "      - Click the extension icon"
echo "      - Set your project root path"
echo "      - Click 'Auto-Extract All Artifacts'"
echo ""
echo "💡 Tips:"
echo "   - Make sure to decorate your Claude artifacts with file paths"
echo "   - Example: // src/components/Dashboard.tsx"
echo "   - The service will automatically organize files in your project"
echo ""
echo "🔧 Development mode (auto-restart):"
echo "   ./start-dev.sh"
echo ""
echo "📚 For help, check the README.md file"
