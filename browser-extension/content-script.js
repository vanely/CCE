// browser-extension/content-script.js

class ClaudeArtifactExtractor {
  constructor() {
    this.isExtracting = false;
    this.extractedCount = 0;
    this.totalArtifacts = 0;
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'START_EXTRACTION') {
        this.startAutoExtraction();
        sendResponse({ success: true });
      } else if (message.type === 'GET_STATUS') {
        sendResponse({ 
          isExtracting: this.isExtracting,
          extractedCount: this.extractedCount,
          totalArtifacts: this.totalArtifacts
        });
      }
    });
  }

  async startAutoExtraction() {
    if (this.isExtracting) {
      console.log('⚠️ Extraction already in progress');
      return;
    }

    this.isExtracting = true;
    this.extractedCount = 0;
    
    try {
      // Find all downloadable artifacts
      const downloadLinks = this.findAllArtifactDownloads();
      this.totalArtifacts = downloadLinks.length;
      
      console.log(`🎯 Found ${this.totalArtifacts} artifacts to extract`);
      
      if (this.totalArtifacts === 0) {
        this.notifyUser('No artifacts found on this page');
        return;
      }

      // Update popup with progress
      this.updateProgress();
      
      // Process each artifact with delay to avoid overwhelming
      for (let i = 0; i < downloadLinks.length; i++) {
        const link = downloadLinks[i];
        console.log(`📥 Processing artifact ${i + 1}/${this.totalArtifacts}: ${link.getAttribute('download')}`);
        
        await this.processArtifactLink(link);
        this.extractedCount++;
        this.updateProgress();
        
        // Small delay between extractions
        await this.delay(500);
      }
      
      this.notifyUser(`✅ Successfully extracted ${this.extractedCount} artifacts!`);
      
    } catch (error) {
      console.error('❌ Auto extraction failed:', error);
      this.notifyUser(`❌ Extraction failed: ${error.message}`);
    } finally {
      this.isExtracting = false;
      this.updateProgress();
    }
  }

  findAllArtifactDownloads() {
    // Find all download links with blob URLs (Claude artifacts)
    const downloadLinks = Array.from(document.querySelectorAll('a[download][href^="blob:"]'));
    
    // Filter to only include actual code artifacts (not images, etc.)
    return downloadLinks.filter(link => {
      const filename = link.getAttribute('download');
      const codeExtensions = ['.tsx', '.ts', '.jsx', '.js', '.py', '.html', '.css', '.json', '.vue', '.svelte', '.php', '.rb', '.go', '.rs', '.cpp', '.c', '.java', '.kt', '.swift', '.dart', '.scss', '.less', '.sql', '.sh', '.yml', '.yaml', '.xml', '.md'];
      return codeExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    });
  }

  async processArtifactLink(link) {
    const blobUrl = link.href;
    const filename = link.getAttribute('download');
    
    try {
      // Attempt blob interception first
      const response = await fetch(blobUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.status}`);
      }
      
      const content = await response.text();
      
      // Extract file path from first line (your decoration pattern)
      const pathMatch = content.match(/^\/\/ ([\w\-./]+\.\w+)$/m) || 
                       content.match(/^# ([\w\-./]+\.\w+)$/m) ||
                       content.match(/^<!-- ([\w\-./]+\.\w+) -->$/m) ||
                       content.match(/^\/\* ([\w\-./]+\.\w+) \*\/$/m);
      
      const filePath = pathMatch ? pathMatch[1] : this.generatePathFromFilename(filename);
      
      // Send to local service
      const result = await this.sendToLocalService({
        type: 'ARTIFACT_DETECTED',
        data: {
          filePath,
          content,
          language: this.getLanguageFromExtension(filename),
          timestamp: Date.now(),
          source: 'auto_blob_interception',
          originalFilename: filename
        }
      });
      
      if (result.success) {
        console.log(`✅ Successfully processed: ${filePath}`);
      } else {
        throw new Error(result.error || 'Unknown error from local service');
      }
      
    } catch (error) {
      console.warn(`❌ Blob interception failed for ${filename}, falling back to download monitoring:`, error);
      
      // Fallback: Trigger download and let service handle it
      await this.sendToLocalService({
        type: 'BLOB_EXTRACTION_FAILED',
        data: {
          filename,
          timestamp: Date.now(),
          source: 'auto_download_fallback'
        }
      });
      
      // Programmatically trigger download
      this.triggerDownload(link);
    }
  }

  triggerDownload(link) {
    // Create a temporary click event to trigger download
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    link.dispatchEvent(event);
  }

  generatePathFromFilename(filename) {
    // Fallback path generation based on file type
    const ext = filename.split('.').pop().toLowerCase();
    
    const pathMappings = {
      'tsx': `src/components/${filename}`,
      'ts': `src/utils/${filename}`,
      'jsx': `src/components/${filename}`,
      'js': `src/utils/${filename}`,
      'css': `src/styles/${filename}`,
      'scss': `src/styles/${filename}`,
      'html': `public/${filename}`,
      'json': `src/data/${filename}`,
      'py': `src/${filename}`,
      'md': `docs/${filename}`
    };
    
    return pathMappings[ext] || `src/${filename}`;
  }

  getLanguageFromExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const langMap = {
      'tsx': 'typescript',
      'ts': 'typescript', 
      'jsx': 'javascript',
      'js': 'javascript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'vue': 'vue',
      'svelte': 'svelte',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'java': 'java',
      'kt': 'kotlin',
      'swift': 'swift',
      'dart': 'dart',
      'sql': 'sql',
      'sh': 'bash',
      'yml': 'yaml',
      'yaml': 'yaml',
      'xml': 'xml',
      'md': 'markdown'
    };
    return langMap[ext] || 'text';
  }

  async sendToLocalService(message) {
    try {
      const response = await fetch('http://localhost:3000/api/process-artifact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Service responded with ${response.status}: ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to communicate with local service:', error);
      throw error;
    }
  }

  updateProgress() {
    // Send progress update to popup
    chrome.runtime.sendMessage({
      type: 'PROGRESS_UPDATE',
      data: {
        isExtracting: this.isExtracting,
        extractedCount: this.extractedCount,
        totalArtifacts: this.totalArtifacts
      }
    });
  }

  notifyUser(message) {
    // Send notification to popup
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      data: { message }
    });
    
    console.log('📢', message);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize the extractor
const extractor = new ClaudeArtifactExtractor();
console.log('🚀 Claude Artifact Extractor loaded and ready!');
