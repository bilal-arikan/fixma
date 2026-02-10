# FigmaOrganizer - Figma Plugin

A powerful Figma plugin that applies JSON-based design rules to automate design changes in Figma documents.

## ✨ Features

- **Rename**: Rename nodes by ID or name with fallback search
- **Create Components**: Convert selected nodes into components
- **Auto Layout**: Apply automatic layout rules to frames
- **Generate Variants**: Create variant sets for components
- **Apply Styles**: Set text styles and fill colors

## 🎯 Core Capabilities

- 🔍 **Smart Node Search**: Falls back to name-based search if ID not found
- 🔄 **Group to Frame Conversion**: Automatically converts Group nodes to Frames
- 🛡️ **Safety Checks**: Validates locked layers and component conflicts
- 📋 **Dry-run Mode**: Preview changes before applying them
- 📊 **Detailed Logging**: Track all operations with timestamps and error details

## 📁 Project Structure

```
manifest.json           # Plugin metadata
code.ts                 # Main plugin logic
ui.html                 # User interface
types.ts                # TypeScript types
tsconfig.json           # TypeScript config
package.json            # Dependencies
example-rules.json      # Sample rules
```

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- TypeScript 4.9+
- Figma Desktop

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build**:
   ```bash
   npm run build
   ```

3. **Load in Figma**:
   - Open Figma Desktop
   - Plugins → Development → New plugin
   - Select `manifest.json`

## 📖 JSON Rules Format

```json
{
  "rename": [
    { "id": "12:32", "name": "btn_primary" }
  ],
  "makeComponent": [
    { "id": "12:40", "type": "button" }
  ],
  "layout": [
    { 
      "id": "12:50", 
      "mode": "auto", 
      "spacing": 8,
      "padding": { "horizontal": 16, "vertical": 12 }
    }
  ],
  "variants": [
    { "base": "btn_primary", "props": ["default", "hover", "pressed"] }
  ],
  "styles": [
    {
      "id": "14:2",
      "textStyle": "h1",
      "fillColor": { "r": 51, "g": 51, "b": 51 }
    }
  ]
}
```

## 🎮 Usage

1. **Paste JSON rules** into the input area
2. **Check "Dry-run"** to preview changes (optional)
3. **Click "Apply Rules"** to execute
4. **Check logs** for results and errors
5. **Undo (Ctrl+Z)** if needed

## 📋 Rule Types

### Rename
```json
{ "id": "NODE_ID", "name": "new_name" }
```

### Make Component
```json
{ "id": "NODE_ID", "type": "component_name" }
```

### Layout
```json
{ "id": "NODE_ID", "mode": "auto|absolute", "spacing": 8 }
```

### Variants
```json
{ "base": "component_name", "props": ["variant1", "variant2"] }
```

### Styles
```json
{ "id": "NODE_ID", "textStyle": "style_name", "fillColor": { "r": 255, "g": 255, "b": 255 } }
```

## 🛠️ Commands

```bash
npm run build      # Build TypeScript
npm run watch      # Watch and rebuild on changes
npm run dev        # Build and watch
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin won't load | Check `manifest.json`, rebuild with `npm run build` |
| JSON errors | Validate JSON syntax, check quotes and commas |
| Node not found | Copy node ID from Figma (Right-click → Copy/Paste) |
| Styles not applied | Create local styles in Figma first |

## 📊 Example Workflow

```
Prepare JSON Rules
    ↓
Paste into Plugin UI
    ↓
(Optional) Preview with Dry-run
    ↓
Click "Apply Rules"
    ↓
Review logs
    ↓
Undo if needed (Ctrl+Z)
```

## 🔐 Safety Features

- ✅ Locked layer detection with warnings
- ✅ Duplicate component checks
- ✅ Full undo/redo support
- ✅ Missing style/node fallback handling
- ✅ Error logging with recovery options

## 📄 Technical Stack

- **Language**: TypeScript 4.9+
- **API**: Figma Plugin API v1.0.0
- **UI**: HTML5 + Inline CSS
- **Build**: tsc (TypeScript Compiler)

## 📝 Version

**v1.0.0** - Active Development

## 📖 API Reference

See [Figma Plugin Docs](https://www.figma.com/plugin-docs/) for detailed API documentation.

---

**Status**: Production Ready  
**License**: MIT  
**Support**: Check logs for detailed error information

