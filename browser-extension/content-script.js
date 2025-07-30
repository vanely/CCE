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
      } else if (message.type === 'PING') {
        // Respond to ping to confirm content script is loaded
        sendResponse({ success: true, message: 'Content script is active' });
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
      console.log('🔍 Starting Claude artifact extraction workflow...');
      
      // Step 1: Find all artifact preview buttons in chat
      const artifactButtons = this.findAllArtifactButtons();
      console.log(`🎯 Found ${artifactButtons.length} artifact buttons in chat`);
      
      if (artifactButtons.length === 0) {
        console.log('⚠️ No artifact buttons found in chat!');
        this.notifyUser('No code artifacts found in this chat. Make sure you have generated code with Claude.');
        return;
      }

      this.totalArtifacts = artifactButtons.length;
      this.updateProgress();
      
      // Step 2: Process each artifact by clicking and extracting
      for (let i = 0; i < artifactButtons.length; i++) {
        const button = artifactButtons[i];
        const artifactName = this.getArtifactName(button);
        console.log(`📥 Processing artifact ${i + 1}/${this.totalArtifacts}: ${artifactName}`);
        
        try {
          await this.processArtifactButton(button, artifactName);
        this.extractedCount++;
        this.updateProgress();
        } catch (error) {
          console.warn(`❌ Failed to process artifact ${artifactName}:`, error);
        }
        
        // Small delay between artifacts
        await this.delay(1000);
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

  findAllArtifactButtons() {
    console.log('🔍 Searching for artifact preview buttons in chat...');
    
    // Find buttons with aria-label="Preview contents" (artifact buttons in chat)
    const artifactButtons = Array.from(document.querySelectorAll('button[aria-label="Preview contents"]'));
    console.log('🔍 Found artifact buttons:', artifactButtons.length);
    
    // Show details of each button found
    artifactButtons.forEach((button, i) => {
      const artifactName = this.getArtifactName(button);
      console.log(`🔍 Artifact button ${i + 1}: ${artifactName}`);
    });
    
    return artifactButtons;
  }

  getArtifactName(button) {
    // Try to find the artifact name from the button's content
    const nameElement = button.querySelector('.leading-tight.text-sm');
    if (nameElement) {
      return nameElement.textContent?.trim() || 'Unknown Artifact';
    }
    
    // Fallback: look for any text content that might be the filename
    const textContent = button.textContent?.trim();
    if (textContent) {
      // Look for common file extensions
      const fileMatch = textContent.match(/([a-zA-Z0-9_-]+\.(tsx|ts|jsx|js|py|html|css|json|vue|svelte|php|rb|go|rs|cpp|c|java|kt|swift|dart|scss|less|sql|sh|yml|yaml|xml|md|txt))/);
      if (fileMatch) {
        return fileMatch[1];
      }
    }
    
    return 'Unknown Artifact';
  }



  async processArtifactButton(button, artifactName) {
    console.log(`🔍 Processing artifact: ${artifactName}`);
    
    // Step 1: Click the artifact button to open the panel
    console.log('🔍 Step 1: Clicking artifact button to open panel...');
    button.click();
    
    // Wait for the panel to open and load
    await this.delay(1500);
    
    // Step 2: Find the dropdown button in the opened panel
    console.log('🔍 Step 2: Looking for dropdown button...');
    const dropdownButton = await this.findDropdownButton();
    
    if (!dropdownButton) {
      console.log('⚠️ No dropdown button found, trying to extract from visible code...');
      return await this.extractFromVisibleCode(artifactName);
    }
    
    // Step 3: Click the dropdown to expand the menu
    console.log('🔍 Step 3: Clicking dropdown to expand menu...');
    console.log('🔍 Dropdown state before click:', dropdownButton.getAttribute('aria-expanded'));
    
    dropdownButton.click();
    
    // Wait and check if the dropdown actually expanded
    let expanded = false;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!expanded && attempts < maxAttempts) {
      await this.delay(200);
      attempts++;
      
      const currentExpanded = dropdownButton.getAttribute('aria-expanded');
      const currentState = dropdownButton.getAttribute('data-state');
      
      console.log(`🔍 Attempt ${attempts}: aria-expanded="${currentExpanded}", data-state="${currentState}"`);
      
      if (currentExpanded === 'true') {
        expanded = true;
        console.log('✅ Dropdown successfully expanded!');
      }
    }
    
    if (!expanded) {
      console.log('⚠️ Dropdown did not expand, trying alternative click method...');
      // Try alternative click methods
      dropdownButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      dropdownButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      dropdownButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      await this.delay(500);
      
      const finalExpanded = dropdownButton.getAttribute('aria-expanded');
      const finalState = dropdownButton.getAttribute('data-state');
      console.log(`🔍 Final state after alternative click: aria-expanded="${finalExpanded}", data-state="${finalState}"`);
    }
    
    // Step 4: Try to find and click the Copy button
    console.log('🔍 Step 4: Looking for Copy button...');
    const copyButton = await this.findCopyButton();
    
    if (copyButton) {
      console.log('🔍 Step 5: Clicking Copy button to copy content to clipboard...');
      await this.clickCopyButtonAndExtract(copyButton, artifactName);
    } else {
      console.log('⚠️ No Copy button found, trying to extract from visible code...');
      return await this.extractFromVisibleCode(artifactName);
    }
  }

  async findDropdownButton() {
    // Look for the dropdown button with aria-haspopup="menu"
    // But exclude the sidebar toggle button
    const dropdownButtons = document.querySelectorAll('button[aria-haspopup="menu"]');
    
    for (const button of dropdownButtons) {
      const ariaLabel = button.getAttribute('aria-label');
      const dataTestId = button.getAttribute('data-testid');
      
      // Skip the sidebar toggle button
      if (ariaLabel === 'Sidebar' || dataTestId === 'pin-sidebar-toggle') {
        console.log('🔍 Skipping sidebar toggle button');
        continue;
      }
      
      console.log('✅ Found dropdown button');
      console.log('🔍 Dropdown button state:', {
        ariaExpanded: button.getAttribute('aria-expanded'),
        dataState: button.getAttribute('data-state'),
        ariaLabel: ariaLabel,
        dataTestId: dataTestId,
        classes: button.className
      });
      return button;
    }
    
    console.log('❌ No dropdown button found (excluding sidebar toggle)');
    return null;
  }

  async findCopyButton() {
    console.log('🔍 Searching for Copy button...');
    
    // Look for the Copy button with the specific structure
    const copyButtons = Array.from(document.querySelectorAll('button')).filter(button => {
      // Check if it has the nested div structure with "Copy" text
      const innerDiv = button.querySelector('div > div');
      return innerDiv && innerDiv.textContent?.trim() === 'Copy';
    });
    
    console.log(`🔍 Found ${copyButtons.length} Copy buttons`);
    
    // Show details of each Copy button found
    copyButtons.forEach((button, i) => {
      console.log(`🔍 Copy button ${i + 1}:`, {
        className: button.className,
        visible: button.offsetParent !== null,
        style: button.style.display,
        textContent: button.textContent?.trim()
      });
    });
    
    // Return the first visible Copy button
    const visibleCopyButton = copyButtons.find(button => button.offsetParent !== null);
    
    if (visibleCopyButton) {
      console.log('✅ Found visible Copy button');
      return visibleCopyButton;
    } else if (copyButtons.length > 0) {
      console.log('⚠️ Found Copy button but it may not be visible');
      return copyButtons[0]; // Return the first one anyway
    }
    
    console.log('❌ No Copy button found');
    return null;
  }

  async clickCopyButtonAndExtract(copyButton, artifactName) {
    console.log('🔍 Clicking Copy button...');
    
    // Click the Copy button
    copyButton.click();
    
    // Wait a moment for the copy operation to complete
    await this.delay(500);
    
    // Try to read from clipboard
    try {
      const clipboardText = await navigator.clipboard.readText();
      console.log(`🔍 Clipboard content length: ${clipboardText.length} characters`);
      console.log(`🔍 First 200 characters: ${clipboardText.substring(0, 200)}...`);
      
      if (clipboardText && clipboardText.trim().length > 10) {
        // Extract file path from first line
        const lines = clipboardText.split('\n');
        const firstLine = lines[0].trim();
        
        console.log(`🔍 First line: "${firstLine}"`);
        
        // Look for file path patterns in the first line
        const pathMatch = firstLine.match(/^\/\/ ([\w\-./]+\.\w+)$/) || 
                         firstLine.match(/^# ([\w\-./]+\.\w+)$/) ||
                         firstLine.match(/^<!-- ([\w\-./]+\.\w+) -->$/) ||
                         firstLine.match(/^\/\* ([\w\-./]+\.\w+) \*\/$/) ||
                         firstLine.match(/^([\w\-./]+\.\w+)$/); // Just a filename
        
        let filePath = artifactName;
        if (pathMatch) {
          filePath = pathMatch[1];
          console.log(`🔍 Extracted file path: ${filePath}`);
        } else {
          console.log(`🔍 No path found in first line, using artifact name: ${artifactName}`);
        }
        
        // Determine language from file extension
        const language = this.getLanguageFromExtension(filePath);
        
        // Send to local service
        const result = await this.sendToLocalService({
          type: 'ARTIFACT_DETECTED',
          data: {
            filePath: filePath,
            content: clipboardText,
            language: language,
            timestamp: Date.now(),
            source: 'clipboard_copy',
            originalFilename: artifactName
          }
        });
        
        if (result.success) {
          console.log(`✅ Successfully extracted from clipboard: ${filePath}`);
        } else {
          throw new Error(result.error || 'Unknown error from local service');
        }
      } else {
        console.log('⚠️ Clipboard content is empty or too short');
        throw new Error('Clipboard content is empty or too short');
      }
    } catch (error) {
      console.error('❌ Failed to read clipboard:', error);
      console.log('⚠️ Falling back to visible code extraction...');
      return await this.extractFromVisibleCode(artifactName);
    }
  }

  async extractFromVisibleCode(artifactName) {
    console.log(`🔍 Extracting from visible code for: ${artifactName}`);
    
    // Find the right panel by looking for the separator div and then finding the panel after it
    const separatorDiv = document.querySelector('div[class*="cursor-col-resize"]');
    
    if (!separatorDiv) {
      console.log('❌ No separator div found - right panel may not be open');
      return;
    }
    
    console.log('✅ Found separator div, looking for right panel...');
    
    // Find the right panel - it should be a sibling or child of the separator's parent
    let rightPanel = null;
    
    // Method 1: Look for the next sibling that contains code
    let currentElement = separatorDiv.parentElement;
    while (currentElement && !rightPanel) {
      const nextSibling = currentElement.nextElementSibling;
      if (nextSibling && nextSibling.querySelector('code')) {
        rightPanel = nextSibling;
        console.log('✅ Found right panel as next sibling');
        break;
      }
      currentElement = currentElement.parentElement;
    }
    
    // Method 2: If not found, look for any element after the separator that contains code
    if (!rightPanel) {
      const allElements = Array.from(document.querySelectorAll('*'));
      const separatorIndex = allElements.indexOf(separatorDiv);
      
      for (let i = separatorIndex + 1; i < allElements.length; i++) {
        const element = allElements[i];
        if (element.querySelector('code')) {
          rightPanel = element;
          console.log('✅ Found right panel after separator');
          break;
        }
      }
    }
    
    if (!rightPanel) {
      console.log('❌ No right panel found after separator');
      console.log('🔍 Available code elements on page:');
      const allCodeElements = document.querySelectorAll('code');
      allCodeElements.forEach((el, i) => {
        console.log(`  Code element ${i + 1}:`, {
          className: el.className,
          textLength: (el.textContent || '').length,
          visible: el.offsetParent !== null,
          parentTag: el.parentElement?.tagName,
          parentClass: el.parentElement?.className?.substring(0, 50)
        });
      });
      return;
    }
    
    console.log('✅ Found right panel, searching for content...');
    
    // First, check if this is a markdown artifact (markdown can contain code snippets)
    const markdownDiv = rightPanel.querySelector('#markdown-artifact');
    
    if (markdownDiv) {
      console.log('✅ Found markdown artifact div');
      // Convert markdown HTML content back to markdown text
      const markdownText = this.convertMarkdownHtmlToText(markdownDiv);
      
      if (markdownText && markdownText.trim().length > 10) {
        console.log(`🔍 Extracted ${markdownText.length} characters of markdown content`);
        
        // Determine filename and language
        const filename = this.generateFilenameFromArtifactName(artifactName, 'markdown');
        
        // Send to local service
        try {
          const result = await this.sendToLocalService({
            type: 'ARTIFACT_DETECTED',
            data: {
              filePath: filename,
              content: markdownText,
              language: 'markdown',
              timestamp: Date.now(),
              source: 'markdown_html_extraction',
              originalFilename: artifactName
            }
          });
          
          if (result.success) {
            console.log(`✅ Successfully extracted markdown: ${filename}`);
          } else {
            throw new Error(result.error || 'Unknown error from local service');
          }
        } catch (error) {
          console.error(`❌ Failed to extract markdown ${filename}:`, error);
          throw error;
        }
        return;
      } else {
        console.log('❌ Markdown content is empty or too short');
      }
    }
    
    // If no markdown found, look for code elements
    console.log('🔍 No markdown artifact found, looking for code elements...');
    const codeSelectors = [
      'code.language-json',
      'code.language-javascript', 
      'code.language-typescript',
      'code.language-python',
      'code.language-html',
      'code.language-css',
      'code.language-markdown',
      'code'
    ];
    
    let codeElement = null;
    for (const selector of codeSelectors) {
      codeElement = rightPanel.querySelector(selector);
      if (codeElement) {
        console.log(`✅ Found code element with selector: ${selector} in right panel`);
        break;
      }
    }
    
    if (!codeElement) {
      console.log('❌ No code element or markdown content found');
      console.log('🔍 Available code elements on page:');
      const allCodeElements = document.querySelectorAll('code');
      allCodeElements.forEach((el, i) => {
        console.log(`  Code element ${i + 1}:`, {
          className: el.className,
          textLength: (el.textContent || '').length,
          visible: el.offsetParent !== null,
          style: el.style.display
        });
      });
      return;
    }
    
    // Extract the text content from the code element
    const codeContent = codeElement.textContent || codeElement.innerText;
    
    console.log('🔍 Code element details:', {
      className: codeElement.className,
      textLength: codeContent.length,
      visible: codeElement.offsetParent !== null,
      style: codeElement.style.display,
      firstChars: codeContent.substring(0, 100) + '...'
    });
    
    if (!codeContent || codeContent.trim().length < 10) {
      console.log('❌ Code content is empty or too short');
      console.log('🔍 Content preview:', codeContent.substring(0, 200));
      return;
    }
    
    console.log(`🔍 Extracted ${codeContent.length} characters of code`);
    
    // Determine language from the class or content
    const language = this.detectLanguageFromCodeElement(codeElement, codeContent);
    const filename = this.generateFilenameFromArtifactName(artifactName, language);
    
    // Send to local service
    try {
      const result = await this.sendToLocalService({
        type: 'ARTIFACT_DETECTED',
        data: {
          filePath: filename,
          content: codeContent,
          language: language,
          timestamp: Date.now(),
          source: 'visible_code_extraction',
          originalFilename: artifactName
        }
      });
      
      if (result.success) {
        console.log(`✅ Successfully extracted: ${filename}`);
      } else {
        throw new Error(result.error || 'Unknown error from local service');
      }
    } catch (error) {
      console.error(`❌ Failed to extract ${filename}:`, error);
      throw error;
    }
  }

  detectLanguageFromCodeElement(codeElement, content) {
    // Try to detect from class name
    const className = codeElement.className || '';
    if (className.includes('language-json')) return 'json';
    if (className.includes('language-javascript')) return 'javascript';
    if (className.includes('language-typescript')) return 'typescript';
    if (className.includes('language-python')) return 'python';
    if (className.includes('language-html')) return 'html';
    if (className.includes('language-css')) return 'css';
    
    // Fallback: detect from content
    if (content.includes('"manifest_version"') || content.includes('"name"')) return 'json';
    if (content.includes('function') || content.includes('const ')) return 'javascript';
    if (content.includes('def ') || content.includes('import ')) return 'python';
    if (content.includes('<html') || content.includes('<!DOCTYPE')) return 'html';
    if (content.includes('{') && content.includes('}') && content.includes('"')) return 'json';
    
    return 'text';
  }

  generateFilenameFromArtifactName(artifactName, language) {
    // If artifactName already has an extension, use it
    if (artifactName.includes('.')) {
      return artifactName;
    }
    
    // Otherwise, add appropriate extension based on language
    const languageExtensions = {
      'javascript': 'js',
      'typescript': 'ts',
      'python': 'py',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'sql': 'sql',
      'bash': 'sh',
      'php': 'php',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rust': 'rs',
      'ruby': 'rb',
      'swift': 'swift',
      'kotlin': 'kt',
      'markdown': 'md'
    };
    
    const ext = languageExtensions[language] || 'txt';
    return `${artifactName}.${ext}`;
  }

  convertMarkdownHtmlToText(markdownDiv) {
    console.log('🔍 Converting markdown HTML to text...');
    
    // Clone the div to avoid modifying the original
    const clone = markdownDiv.cloneNode(true);
    
    // Remove copy buttons and other UI elements
    const copyButtons = clone.querySelectorAll('button[aria-label="Copy to clipboard"]');
    copyButtons.forEach(button => button.remove());
    
    // Remove code block wrappers but keep the content
    const codeBlocks = clone.querySelectorAll('.relative.group\\/copy');
    codeBlocks.forEach(block => {
      const codeElement = block.querySelector('code');
      if (codeElement) {
        // Replace the entire block with just the code content
        const codeContent = codeElement.textContent || codeElement.innerText;
        const preElement = document.createElement('pre');
        preElement.textContent = codeContent;
        block.replaceWith(preElement);
      }
    });
    
    // Convert HTML elements back to markdown
    let markdownText = clone.innerHTML;
    
    // Replace common HTML elements with markdown equivalents
    markdownText = markdownText
      // Headers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n')
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n')
      
      // Paragraphs
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      
      // Lists
      .replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
        return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
      })
      .replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
        let counter = 1;
        return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${counter++}. $1\n`) + '\n';
      })
      
      // Code blocks
      .replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n')
      
      // Inline code
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      
      // Bold
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      
      // Italic
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      
      // Links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      
      // Line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      
      // Remove remaining HTML tags
      .replace(/<[^>]*>/g, '')
      
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      
      // Clean up extra whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
    
    console.log(`🔍 Converted HTML to ${markdownText.length} characters of markdown`);
    return markdownText;
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
      
      // Check if it's a blocked request error
      if (error.message.includes('ERR_BLOCKED_BY_CLIENT') || 
          error.message.includes('ERR_FAILED') ||
          error.message.includes('ERR_NETWORK')) {
        console.error('🚫 Request blocked by ad blocker or privacy extension. Please disable extensions for localhost or add localhost:3000 to your allowlist.');
        this.notifyUser('Request blocked by browser extension. Please disable ad blockers for localhost:3000');
      }
      
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

  async extractFromCodeBlocks() {
    console.log('🔍 Extracting from code blocks...');
    
    // Find all code blocks on the page
    const codeBlocks = Array.from(document.querySelectorAll('pre code, .code-block code, [class*="code"] code, pre'));
    console.log('🔍 Found code blocks:', codeBlocks.length);
    
    let extractedCount = 0;
    
    for (let i = 0; i < codeBlocks.length; i++) {
      const codeBlock = codeBlocks[i];
      const codeContent = codeBlock.textContent || codeBlock.innerText;
      
      if (!codeContent || codeContent.trim().length < 10) {
        continue; // Skip empty or very short blocks
      }
      
      // Try to detect language from class names or content
      const language = this.detectLanguageFromCodeBlock(codeBlock, codeContent);
      const filename = this.generateFilenameFromCodeBlock(codeBlock, language, i);
      
      console.log(`🔍 Processing code block ${i + 1}: ${filename} (${language})`);
      
      try {
        const result = await this.sendToLocalService({
          type: 'ARTIFACT_DETECTED',
          data: {
            filePath: filename,
            content: codeContent,
            language: language,
            timestamp: Date.now(),
            source: 'code_block_extraction',
            originalFilename: filename
          }
        });
        
        if (result.success) {
          console.log(`✅ Successfully extracted code block: ${filename}`);
          extractedCount++;
        }
      } catch (error) {
        console.warn(`❌ Failed to extract code block ${filename}:`, error);
      }
    }
    
    console.log(`🔍 Extracted ${extractedCount} code blocks`);
    return extractedCount;
  }

  detectLanguageFromCodeBlock(codeBlock, content) {
    // Try to detect language from class names
    const classNames = codeBlock.className || '';
    const parentClassNames = codeBlock.parentElement?.className || '';
    
    const languagePatterns = {
      'javascript': /js|javascript/i,
      'typescript': /ts|typescript/i,
      'python': /py|python/i,
      'html': /html/i,
      'css': /css/i,
      'json': /json/i,
      'sql': /sql/i,
      'bash': /bash|sh|shell/i,
      'php': /php/i,
      'java': /java/i,
      'cpp': /cpp|c\+\+/i,
      'c': /c(?![a-z])/i,
      'go': /go/i,
      'rust': /rs|rust/i,
      'ruby': /rb|ruby/i,
      'swift': /swift/i,
      'kotlin': /kt|kotlin/i
    };
    
    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(classNames) || pattern.test(parentClassNames)) {
        return lang;
      }
    }
    
    // Fallback: try to detect from content
    if (content.includes('function') || content.includes('const ') || content.includes('let ')) {
      return 'javascript';
    } else if (content.includes('def ') || content.includes('import ')) {
      return 'python';
    } else if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return 'html';
    } else if (content.includes('{') && content.includes('}') && content.includes('"')) {
      return 'json';
    }
    
    return 'text';
  }

  generateFilenameFromCodeBlock(codeBlock, language, index) {
    const languageExtensions = {
      'javascript': 'js',
      'typescript': 'ts',
      'python': 'py',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'sql': 'sql',
      'bash': 'sh',
      'php': 'php',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rust': 'rs',
      'ruby': 'rb',
      'swift': 'swift',
      'kotlin': 'kt'
    };
    
    const ext = languageExtensions[language] || 'txt';
    return `extracted_code_${index + 1}.${ext}`;
  }

  extractFilenameFromLink(link) {
    // Try to extract filename from various sources
    const downloadAttr = link.getAttribute('download');
    if (downloadAttr) {
      return downloadAttr;
    }
    
    // Try to extract from link text
    const linkText = link.textContent?.trim();
    if (linkText) {
      // Look for common patterns like "Download as Markdown" -> "markdown.md"
      if (linkText.includes('Download as Markdown')) {
        return 'document.md';
      } else if (linkText.includes('Download as')) {
        const match = linkText.match(/Download as (\w+)/i);
        if (match) {
          const format = match[1].toLowerCase();
          const extensions = {
            'markdown': 'md',
            'javascript': 'js',
            'typescript': 'ts',
            'python': 'py',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'text': 'txt'
          };
          const ext = extensions[format] || 'txt';
          return `document.${ext}`;
        }
      }
    }
    
    // Fallback: extract from URL or generate timestamp-based name
    const url = link.href;
    if (url.includes('blob:')) {
      const timestamp = Date.now();
      return `claude_artifact_${timestamp}.txt`;
    }
    
    return 'unknown_file.txt';
  }
}

// Initialize the extractor
const extractor = new ClaudeArtifactExtractor();
console.log('🚀 Claude Artifact Extractor loaded and ready!');

// Send a message to confirm the content script is loaded
chrome.runtime.sendMessage({ 
  type: 'CONTENT_SCRIPT_LOADED', 
  url: window.location.href,
  timestamp: Date.now()
}).catch(() => {
  // Background script might not be listening, that's okay
});
