// local-service/artifact-processor.js

const path = require('path');
const chalk = require('chalk');

class ArtifactProcessor {
  constructor() {
    this.totalProcessed = 0;
    this.successfulExtractions = 0;
    this.failedExtractions = 0;
    this.processedFiles = new Map(); // Track processed files to avoid duplicates
  }

  /**
   * Process artifact content and extract metadata
   */
  async processContent(content, filePath, language) {
    try {
      this.totalProcessed++;
      
      // Extract file path from content if not provided or if content has path decoration
      const extractedPath = this.extractFilePathFromContent(content) || filePath;
      
      // Clean up the content by removing path decoration
      const cleanedContent = this.removePathDecoration(content);
      
      // Add any language-specific processing
      const processedContent = this.applyLanguageSpecificProcessing(cleanedContent, language, extractedPath);
      
      this.successfulExtractions++;
      
      console.log(chalk.blue(`🔄 Processed content for: ${extractedPath}`));
      
      return {
        content: processedContent,
        filePath: extractedPath,
        language,
        metadata: this.extractMetadata(processedContent, language)
      };
      
    } catch (error) {
      this.failedExtractions++;
      console.error(chalk.red(`❌ Failed to process content:`, error.message));
      throw error;
    }
  }

  /**
   * Extract file path from content using various comment patterns
   */
  extractFilePathFromContent(content) {
    const pathPatterns = [
      // JavaScript/TypeScript: // path/to/file.ext
      /^\/\/ ([\w\-./]+\.\w+)$/m,
      
      // Python: # path/to/file.ext  
      /^# ([\w\-./]+\.\w+)$/m,
      
      // HTML/XML: <!-- path/to/file.ext -->
      /^<!-- ([\w\-./]+\.\w+) -->$/m,
      
      // CSS: /* path/to/file.ext */
      /^\/\* ([\w\-./]+\.\w+) \*\/$/m,
      
      // Shell/Bash: # path/to/file.ext
      /^# ([\w\-./]+\.\w+)$/m,
      
      // SQL: -- path/to/file.ext
      /^-- ([\w\-./]+\.\w+)$/m,
      
      // Generic single line at start
      /^([\w\-./]+\.\w+)$/m
    ];
    
    for (const pattern of pathPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        console.log(chalk.green(`📍 Extracted path from content: ${match[1]}`));
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Remove path decoration comments from content
   */
  removePathDecoration(content) {
    const lines = content.split('\n');
    
    // Check if first line looks like a path decoration
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      
      // Pattern matches for path decorations
      const decorationPatterns = [
        /^\/\/ [\w\-./]+\.\w+$/,          // // path/file.ext
        /^# [\w\-./]+\.\w+$/,             // # path/file.ext
        /^<!-- [\w\-./]+\.\w+( -->)?$/,   // <!-- path/file.ext -->
        /^\/\* [\w\-./]+\.\w+( \*\/)?$/,  // /* path/file.ext */
        /^-- [\w\-./]+\.\w+$/,            // -- path/file.ext
        /^[\w\-./]+\.\w+$/                // path/file.ext (bare)
      ];
      
      const isDecoration = decorationPatterns.some(pattern => pattern.test(firstLine));
      
      if (isDecoration) {
        // Remove the first line and any empty lines that follow
        let startIndex = 1;
        while (startIndex < lines.length && lines[startIndex].trim() === '') {
          startIndex++;
        }
        return lines.slice(startIndex).join('\n');
      }
    }
    
    return content;
  }

  /**
   * Apply language-specific processing
   */
  applyLanguageSpecificProcessing(content, language, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.processJavaScriptTypeScript(content, ext);
      
      case 'python':
        return this.processPython(content);
      
      case 'html':
        return this.processHTML(content);
      
      case 'css':
      case 'scss':
        return this.processCSS(content);
      
      case 'json':
        return this.processJSON(content);
      
      default:
        return content;
    }
  }

  processJavaScriptTypeScript(content, ext) {
    // Ensure proper imports and exports are maintained
    // Add any missing semicolons if needed
    let processed = content;
    
    // Add JSX pragma for React files if missing
    if ((ext === '.tsx' || ext === '.jsx') && !processed.includes('React')) {
      if (!processed.includes('import React') && processed.includes('<')) {
        processed = `import React from 'react';\n\n${processed}`;
      }
    }
    
    return processed;
  }

  processPython(content) {
    // Ensure proper Python formatting
    let processed = content;
    
    // Add encoding declaration if missing
    if (!processed.includes('# -*- coding:') && !processed.includes('# coding:')) {
      processed = `# -*- coding: utf-8 -*-\n${processed}`;
    }
    
    return processed;
  }

  processHTML(content) {
    // Ensure proper HTML structure
    let processed = content;
    
    // Add DOCTYPE if missing and content looks like full HTML document
    if (processed.includes('<html') && !processed.includes('<!DOCTYPE')) {
      processed = `<!DOCTYPE html>\n${processed}`;
    }
    
    return processed;
  }

  processCSS(content) {
    // Ensure proper CSS formatting
    return content;
  }

  processJSON(content) {
    // Validate and format JSON
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Invalid JSON, keeping original content`));
      return content;
    }
  }

  /**
   * Extract metadata from content
   */
  extractMetadata(content, language) {
    const metadata = {
      language,
      lineCount: content.split('\n').length,
      charCount: content.length,
      hasImports: false,
      hasExports: false,
      dependencies: [],
      framework: null
    };

    // Detect imports
    const importPatterns = [
      /^import\s+.*from\s+['"]([^'"]+)['"]/gm,  // ES6 imports
      /^const\s+.*\s*=\s*require\(['"]([^'"]+)['"]\)/gm,  // CommonJS
      /^#include\s+<([^>]+)>/gm,  // C/C++
      /^import\s+([^\s]+)/gm,  // Python
      /^@import\s+['"]([^'"]+)['"]/gm  // CSS
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        metadata.hasImports = true;
        metadata.dependencies.push(match[1]);
      }
    }

    // Detect exports
    if (/^export\s+/m.test(content) || /module\.exports\s*=/m.test(content)) {
      metadata.hasExports = true;
    }

    // Detect framework
    if (metadata.dependencies.some(dep => dep.includes('react'))) {
      metadata.framework = 'React';
    } else if (metadata.dependencies.some(dep => dep.includes('vue'))) {
      metadata.framework = 'Vue';
    } else if (metadata.dependencies.some(dep => dep.includes('angular'))) {
      metadata.framework = 'Angular';
    }

    return metadata;
  }

  /**
   * Check if file has already been processed to avoid duplicates
   */
  hasBeenProcessed(filePath, contentHash) {
    const key = `${filePath}:${contentHash}`;
    return this.processedFiles.has(key);
  }

  /**
   * Mark file as processed
   */
  markAsProcessed(filePath, contentHash) {
    const key = `${filePath}:${contentHash}`;
    this.processedFiles.set(key, {
      timestamp: Date.now(),
      filePath
    });
  }

  /**
   * Generate content hash for duplicate detection
   */
  generateContentHash(content) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get processing statistics
   */
  getTotalProcessed() {
    return this.totalProcessed;
  }

  getSuccessfulExtractions() {
    return this.successfulExtractions;
  }

  getFailedExtractions() {
    return this.failedExtractions;
  }

  getProcessedFiles() {
    return Array.from(this.processedFiles.values());
  }

  /**
   * Process artifact data (main entry point for artifact processing)
   */
  async processArtifact(artifactData) {
    try {
      const { type, filename, content } = artifactData;
      
      if (!content) {
        console.log(chalk.yellow(`⚠️ No content provided for artifact: ${filename}`));
        return null;
      }

      // Determine language from filename
      const language = this.detectLanguage(filename);
      
      // Process the content
      const result = await this.processContent(content, filename, language);
      
      // Mark as processed to avoid duplicates
      const contentHash = this.generateContentHash(content);
      this.markAsProcessed(filename, contentHash);
      
      console.log(chalk.green(`✅ Artifact processed: ${filename} (${language})`));
      
      return result.content;
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to process artifact: ${artifactData.filename}`), error.message);
      return null;
    }
  }

  /**
   * Detect programming language from filename
   */
  detectLanguage(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    const languageMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.json': 'json',
      '.xml': 'xml',
      '.md': 'markdown',
      '.txt': 'text',
      '.sh': 'bash',
      '.bash': 'bash',
      '.sql': 'sql',
      '.php': 'php',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin'
    };
    
    return languageMap[ext] || 'text';
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.totalProcessed = 0;
    this.successfulExtractions = 0;
    this.failedExtractions = 0;
    this.processedFiles.clear();
  }
}

module.exports = ArtifactProcessor;