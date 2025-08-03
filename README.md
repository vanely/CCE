# README.md

# Claude Code Extractor

Automatically extract and organize Claude code artifacts into your project directory structure.

## Overview

This tool consists of a browser extension and local service that work together to:
- 🎯 **Auto-detect** all downloadable code artifacts in Claude conversations
- 📥 **Extract content** via blob interception or download monitoring  
- 🗂️ **Organize files** into proper project directory structure
- 💾 **Create backups** of existing files before overwriting
- 🧹 **Clean up** downloaded files automatically

## Quick Start

### 1. Installation

```bash
git clone <https://github.com/vanely/CCE.git>
cd claude-code-extractor
chmod +x setup.sh
./setup.sh
cd local-service
npm run dev
```

### 2. Load Browser Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked", or open location of project, and drag `browser-extension/` dir into chrome extensions space in browser.
4. Select the `browser-extension/` folder
5. Pin the extension to your toolbar

### 3. Start Local Service

```bash
./start-service.sh
```

The service will be available at `http://localhost:3030`

### 4. Configure & Use

**IMPORTANT NOTE: Make sure you add the following to your prompt so that generated artifacts are created in the correct format to be handled by this app**.

**Prompt:**
Start by creating a project directory structure that will house the project files you're about to generate, and as you create each artifact, ensure that the artifact name is the files path in the project directory structure, ending in the file name with its corresponding extension. Ensure that this same naming pattern(path ending in filename) is included as the first line of every file generated, as a comment.

1. **In Claude**: Generate code and decorate with file paths:
   ```typescript
   // src/components/Dashboard.tsx
   import React from 'react';
   
   export const Dashboard = () => {
     return <div>Hello World</div>;
   };
   ```

2. **In Browser**: Click the extension icon → Set project root → Click "Auto-Extract All Artifacts"

3. **Result**: Files automatically organized in your project:
   ```
   your-project/
   ├── src/
   │   └── components/
   │       └── Dashboard.tsx
   └── .claude-backups/
   ```

## Features

### 🎯 Smart Detection
- Automatically finds all downloadable code artifacts on Claude pages
- Supports multiple file types (TypeScript, JavaScript, Python, CSS, HTML, etc.)
- Filters out non-code files (images, documents)

### 📁 Intelligent Organization  
- Extracts file paths from decorated comments in your code
- Creates directory structure automatically
- Fallback path generation based on file types

### 💾 Safe File Management
- Creates timestamped backups before overwriting existing files
- Validates file paths to prevent directory traversal attacks
- Configurable backup retention and cleanup

### 🔄 Multi Extraction Methods
1. **Blob Interception** (Primary): Fast, direct content extraction(wip)
2. **Download Monitoring** (Fallback): Monitors Downloads folder for failed extractions(wip)
3. **Copy Artifact**(Fallback): Opens artifact preview and clicks on copy, then extracts from clipboard(wip-permission issues)
4. **Extract Visible Artifact From HTML**(Fallback): Opens artifact preview, and extracts artifact from rendered HTML(functional).

### ⚙️ Configurable Settings
- Auto-cleanup of downloaded files
- Backup creation on/off
- Custom project root paths
- Download timeout settings

## File Path Decoration

Decorate your Claude-generated code with file paths at the top:

### JavaScript/TypeScript
```javascript
// src/utils/helpers.js
export const formatDate = (date) => {
  return date.toLocaleDateString();
};
```

### Python
```python
# src/models/user.py
class User:
    def __init__(self, name):
        self.name = name
```

### CSS
```css
/* src/styles/components.css */
.button {
  background: #007AFF;
  border: none;
}
```

### HTML
```html
<!-- public/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
</html>
```

## API Endpoints

The local service exposes several endpoints:

### `GET /api/status`
Get service health and statistics

### `POST /api/set-project`
```json
{
  "projectRoot": "/path/to/your/project"
}
```

### `POST /api/process-artifact`
Process individual artifacts (used by extension)

### `GET /api/stats`
Get extraction statistics and metrics

## Development

### Start in Development Mode
```bash
./start-dev.sh
```

This enables auto-restart when files change.

### Project Structure
```
claude-code-extractor/
├── browser-extension/          # Chrome extension files
│   ├── manifest.json          # Extension configuration
│   ├── content-script.js      # Claude page interaction
│   ├── background.js          # Extension background service
│   ├── popup.html/js/css      # Extension UI
├── local-service/             # Node.js service
│   ├── server.js              # Main service entry point
│   ├── artifact-processor.js  # Content processing logic
│   ├── file-manager.js        # File system operations
│   ├── download-monitor.js    # Downloads folder monitoring
│   └── package.json          # Dependencies
└── setup.sh                  # Installation script
```

### Adding Language Support

To add support for new file types:

1. **Update `content-script.js`**: Add extension to `getLanguageFromExtension()`
2. **Update `artifact-processor.js`**: Add processing logic in `applyLanguageSpecificProcessing()`
3. **Update decoration patterns**: Add comment syntax in `extractFilePathFromContent()`

## Troubleshooting

### Extension Not Working
- Check that the local service is running on port 3030
- Verify you're on a Claude conversation page
- Check browser console for error messages

### Files Not Being Extracted
- Ensure artifacts are decorated with file paths
- Check that project root is set correctly
- Verify file permissions in target directory

### Service Won't Start
- Check Node.js version (16+ required)
- Verify port 3030 is available
- Check for missing dependencies (`npm install`)

### Downloads Folder Issues
- Verify Downloads folder path (default: `~/Downloads`)
- Check file permissions on Downloads folder
- Ensure sufficient disk space

## Configuration

### Environment Variables
```bash
PORT=3030                    # Service port
DOWNLOADS_PATH=~/Downloads   # Custom downloads path
BACKUP_RETENTION_DAYS=7      # Backup file retention
```

### Extension Settings
Access via extension popup:
- Project root path
- Auto-cleanup downloads
- Create backups on overwrite
- Service URL (default: localhost:3030)

## Security

- File paths are validated to prevent directory traversal
- Service only accepts connections from browser extensions
- No external network access required
- All processing happens locally

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review browser console logs
3. Check service logs in terminal
4. Create an issue with detailed error information

---

**Happy coding! 🚀**