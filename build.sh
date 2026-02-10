#!/bin/bash
# Figma Plugin Build and Development Script

set -e

echo "🔨 Figma Plugin Build Starting..."

# Check dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Compile TypeScript
echo "⚙️  Compiling TypeScript..."
npx tsc

# Check if code.js was created
if [ -f "code.js" ]; then
    echo "✅ code.js created successfully"
else
    echo "❌ code.js could not be created"
    exit 1
fi

# Check HTML file
if [ -f "ui.html" ]; then
    echo "✅ ui.html file found"
else
    echo "⚠️  ui.html file not found"
fi

# Check manifest
if [ -f "manifest.json" ]; then
    echo "✅ manifest.json file found"
else
    echo "❌ manifest.json file required!"
    exit 1
fi

echo ""
echo "🎉 Build completed!"
echo ""
echo "Next steps:"
echo "1. Open Figma"
echo "2. Plugins → Development → New plugin"
echo "3. Select manifest.json file"
echo "4. Observe the plugin panel opening"
echo ""
echo "🔄 For automatic compilation during development:"
echo "   npm run watch"
