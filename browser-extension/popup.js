// browser-extension/popup.js

class PopupController {
  constructor() {
    this.isExtracting = false;
    this.serviceStatus = { isHealthy: false };
    
    this.initializeElements();
    this.setupEventListeners();
    this.loadSettings();
    this.checkServiceStatus();
    this.checkExtractionStatus();
  }

  initializeElements() {
    // Core elements
    this.projectPathInput = document.getElementById('projectPath');
    this.setProjectBtn = document.getElementById('setProject');
    this.extractBtn = document.getElementById('extractArtifacts');
    this.browseBtn = document.getElementById('browseProject');
    
    // Status elements
    this.serviceStatusEl = document.getElementById('serviceStatus');
    this.totalArtifactsEl = document.getElementById('totalArtifacts');
    this.extractedCountEl = document.getElementById('extractedCount');
    this.progressContainer = document.getElementById('progressContainer');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.messageContainer = document.getElementById('messageContainer');
    
    // Settings
    this.autoCleanCheckbox = document.getElementById('autoCleanDownloads');
    this.createBackupsCheckbox = document.getElementById('createBackups');
    
    // Footer buttons
    this.clearCacheBtn = document.getElementById('clearCache');
    this.openLogsBtn = document.getElementById('openLogs');
    this.openSettingsBtn = document.getElementById('openSettings');
  }

  setupEventListeners() {
    // Main actions
    this.setProjectBtn.addEventListener('click', () => this.setProjectRoot());
    this.extractBtn.addEventListener('click', () => this.startExtraction());
    this.browseBtn.addEventListener('click', () => this.browseForProject());
    
    // Settings
    this.autoCleanCheckbox.addEventListener('change', () => this.saveSettings());
    this.createBackupsCheckbox.addEventListener('change', () => this.saveSettings());
    
    // Footer actions
    this.clearCacheBtn.addEventListener('click', () => this.clearCache());
    this.openLogsBtn.addEventListener('click', () => this.openLogs());
    this.openSettingsBtn.addEventListener('click', () => this.openAdvancedSettings());
    this.openHelpBtn = document.getElementById('openHelp');
    this.openHelpBtn.addEventListener('click', () => this.openHelp());
    
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case 'PROGRESS_UPDATE':
          this.updateProgress(message.data);
          break;
        case 'NOTIFICATION':
          this.showMessage(message.data.message, 'info');
          break;
      }
    });
    
    // Periodic status updates
    setInterval(() => {
      this.checkServiceStatus();
      this.checkExtractionStatus();
    }, 5000);
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.local.get([
        'projectRoot',
        'serviceUrl',
        'autoCleanDownloads',
        'createBackups'
      ]);
      
      this.projectPathInput.value = settings.projectRoot || '';
      this.autoCleanCheckbox.checked = settings.autoCleanDownloads !== false;
      this.createBackupsCheckbox.checked = settings.createBackups !== false;
      
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        projectRoot: this.projectPathInput.value,
        autoCleanDownloads: this.autoCleanCheckbox.checked,
        createBackups: this.createBackupsCheckbox.checked
      });
      
      this.showMessage('Settings saved', 'success');
    } catch (error) {
      this.showMessage('Failed to save settings', 'error');
    }
  }

  async setProjectRoot() {
    const projectPath = this.projectPathInput.value.trim();
    
    if (!projectPath) {
      this.showMessage('Please enter a project path', 'warning');
      return;
    }
    
    try {
      this.setProjectBtn.classList.add('loading');
      this.setProjectBtn.disabled = true;
      
      const response = await fetch('http://localhost:3030/api/set-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: projectPath })
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      await this.saveSettings();
      this.showMessage('Project root set successfully!', 'success');
      
    } catch (error) {
      // Check if it's a blocked request error
      if (error.message.includes('ERR_BLOCKED_BY_CLIENT') || 
          error.message.includes('ERR_FAILED') ||
          error.message.includes('ERR_NETWORK')) {
        this.showMessage('Request blocked by ad blocker or privacy extension. Please disable extensions for localhost or add localhost:3030 to your allowlist.', 'error');
      } else {
        this.showMessage(`Failed to set project root: ${error.message}`, 'error');
      }
    } finally {
      this.setProjectBtn.classList.remove('loading');
      this.setProjectBtn.disabled = false;
    }
  }

  async startExtraction() {
    if (this.isExtracting) {
      this.showMessage('Extraction already in progress', 'warning');
      return;
    }
    
    if (!this.projectPathInput.value.trim()) {
      this.showMessage('Please set a project root first', 'warning');
      return;
    }
    
    if (!this.serviceStatus.isHealthy) {
      this.showMessage('Local service is not running. Please start the service first.', 'error');
      return;
    }
    
    try {
      // Get current tab and send extraction message
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('claude.ai')) {
        this.showMessage('Please navigate to a Claude conversation first', 'warning');
        return;
      }
      
      // Check if content script is loaded
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      } catch (pingError) {
        this.showMessage('Content script not loaded. Please refresh the Claude page and try again.', 'error');
        return;
      }
      
      this.isExtracting = true;
      this.extractBtn.disabled = true;
      this.extractBtn.textContent = 'Extracting...';
      this.progressContainer.style.display = 'block';
      
      await chrome.tabs.sendMessage(tab.id, { type: 'START_EXTRACTION' });
      
      this.showMessage('Starting artifact extraction...', 'info');
      
    } catch (error) {
      if (error.message.includes('Receiving end does not exist')) {
        this.showMessage('Content script not loaded. Please refresh the Claude page and try again.', 'error');
      } else {
        this.showMessage(`Failed to start extraction: ${error.message}`, 'error');
      }
      this.resetExtractionState();
    }
  }

  updateProgress(data) {
    this.isExtracting = data.isExtracting;
    this.totalArtifactsEl.textContent = data.totalArtifacts || 0;
    this.extractedCountEl.textContent = data.extractedCount || 0;
    
    if (data.isExtracting && data.totalArtifacts > 0) {
      const percentage = Math.round((data.extractedCount / data.totalArtifacts) * 100);
      this.progressFill.style.width = `${percentage}%`;
      this.progressText.textContent = `${percentage}%`;
      this.progressContainer.style.display = 'block';
    } else if (!data.isExtracting) {
      this.resetExtractionState();
    }
  }

  resetExtractionState() {
    this.isExtracting = false;
    this.extractBtn.disabled = false;
    this.extractBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L15 7H12V14H8V7H5L10 2Z" fill="currentColor"/>
        <path d="M4 16H16V18H4V16Z" fill="currentColor"/>
      </svg>
      Auto-Extract All Artifacts
    `;
    this.progressContainer.style.display = 'none';
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';
  }

  async checkServiceStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SERVICE_STATUS' });
      this.serviceStatus = response;
      this.updateServiceStatusUI();
    } catch (error) {
      this.serviceStatus = { isHealthy: false };
      this.updateServiceStatusUI();
    }
  }

  updateServiceStatusUI() {
    const statusDot = this.serviceStatusEl.querySelector('.status-dot');
    const statusText = this.serviceStatusEl.querySelector('span');
    
    if (this.serviceStatus.isHealthy) {
      statusDot.className = 'status-dot healthy';
      statusText.textContent = 'Service Online';
    } else {
      statusDot.className = 'status-dot';
      // Check if it's been blocked recently
      const timeSinceCheck = Date.now() - this.serviceStatus.lastCheck;
      if (timeSinceCheck < 60000) { // Within last minute
        statusText.textContent = 'Service Blocked';
        statusDot.className = 'status-dot blocked';
      } else {
        statusText.textContent = 'Service Offline';
        statusDot.className = 'status-dot';
      }
    }
  }

  async checkExtractionStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url.includes('claude.ai')) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
        this.updateProgress(response);
      }
    } catch (error) {
      // Tab might not have content script loaded
    }
  }

  browseForProject() {
    // Note: File system access is limited in browser extensions
    // This would typically open a directory picker in a desktop app
    this.showMessage('Enter your project path manually or drag & drop is not supported in browser extensions', 'info');
  }

  showMessage(text, type = 'info') {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    this.messageContainer.appendChild(message);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (message.parentNode) {
        message.parentNode.removeChild(message);
      }
    }, 5000);
    
    // Keep only last 3 messages
    const messages = this.messageContainer.querySelectorAll('.message');
    if (messages.length > 3) {
      messages[0].remove();
    }
  }

  async clearCache() {
    try {
      await chrome.storage.local.clear();
      this.showMessage('Cache cleared successfully', 'success');
      await this.loadSettings();
    } catch (error) {
      this.showMessage('Failed to clear cache', 'error');
    }
  }

  openLogs() {
    // Open browser console for now
    this.showMessage('Check browser console for detailed logs', 'info');
  }

  openAdvancedSettings() {
    // Future: Open advanced settings page
    this.showMessage('Advanced settings coming in future version', 'info');
  }

  openHelp() {
    const helpText = `
🔧 Troubleshooting Guide:

1. **Service Blocked Error (ERR_BLOCKED_BY_CLIENT):**
   - Disable ad blockers (uBlock Origin, AdBlock Plus)
   - Disable privacy extensions (Privacy Badger)
           - Add localhost:3030 to your allowlist
   - Or temporarily disable extensions for localhost

2. **Service Offline:**
   - Make sure the local service is running
   - Run: ./start-service.sh in the project directory
   - Check if port 3000 is available

3. **Extension Not Working:**
   - Refresh the Claude page
   - Check browser console for errors
   - Ensure you're on claude.ai domain

4. **Need More Help:**
   - Check the README.md file
   - View browser console logs
   - Restart the extension
    `;
    
    this.showMessage(helpText, 'info');
  }
}

// Initialize popup controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
