// browser-extension/background.js

class BackgroundService {
  constructor() {
    this.setupMessageHandling();
    this.setupInstallHandler();
  }

  setupMessageHandling() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle messages from content script
      if (message.type === 'PROGRESS_UPDATE') {
        this.broadcastToPopup(message);
      } else if (message.type === 'NOTIFICATION') {
        this.broadcastToPopup(message);
        this.showNotification(message.data.message);
      } else if (message.type === 'CONTENT_SCRIPT_LOADED') {
        console.log('✅ Content script loaded on:', message.url);
        // Keep track of loaded content scripts
        this.loadedContentScripts = this.loadedContentScripts || new Set();
        this.loadedContentScripts.add(sender.tab?.id);
      }
      
      // Keep the message channel open for async responses
      return true;
    });
  }

  setupInstallHandler() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('🎉 Claude Code Extractor installed successfully!');
        
        // Set default configuration
        chrome.storage.local.set({
          serviceUrl: 'http://localhost:3030',
          autoCleanDownloads: true,
          createBackups: true
        });
      }
    });
  }

  broadcastToPopup(message) {
    // Try to send message to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might not be open, that's okay
    });
  }

  showNotification(message) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiMwMDdBRkYiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxMiIgeT0iMTIiPgo8cGF0aCBkPSJNMTIgMTlIMTZWMTdIMTJWMTlaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4KPC9zdmc+Cg=='),
      title: 'Claude Code Extractor',
      message: message
    });
  }
}

// Global service management
class ServiceHealthMonitor {
  constructor() {
    this.isServiceHealthy = false;
    this.lastHealthCheck = 0;
    this.healthCheckInterval = 30000; // 30 seconds
    
    // Start periodic health checks
    this.startHealthChecking();
  }

  async startHealthChecking() {
    setInterval(async () => {
      await this.checkServiceHealth();
    }, this.healthCheckInterval);
    
    // Initial check
    await this.checkServiceHealth();
  }

  async checkServiceHealth() {
    try {
      const response = await fetch('http://localhost:3030/api/status', {
        method: 'GET',
        timeout: 5000
      });
      
      this.isServiceHealthy = response.ok;
      this.lastHealthCheck = Date.now();
      
      if (this.isServiceHealthy) {
        console.log('✅ Local service is healthy');
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setBadgeBackgroundColor({ color: '#00AA00' });
      } else {
        throw new Error('Service responded with error');
      }
      
    } catch (error) {
      this.isServiceHealthy = false;
      this.lastHealthCheck = Date.now();
      
      // Check if it's a blocked request error
      if (error.message.includes('ERR_BLOCKED_BY_CLIENT') || 
          error.message.includes('ERR_FAILED') ||
          error.message.includes('ERR_NETWORK')) {
        console.log('❌ Request blocked by client (ad blocker/privacy extension)');
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF8800' }); // Orange for blocked
      } else {
        console.log('❌ Local service is not responding');
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' }); // Red for offline
      }
    }
  }

  getServiceStatus() {
    return {
      isHealthy: this.isServiceHealthy,
      lastCheck: this.lastHealthCheck,
      timeSinceLastCheck: Date.now() - this.lastHealthCheck
    };
  }
}

// Initialize services
const backgroundService = new BackgroundService();
const healthMonitor = new ServiceHealthMonitor();

// Expose health status for popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SERVICE_STATUS') {
    sendResponse(healthMonitor.getServiceStatus());
  }
});

console.log('🚀 Claude Code Extractor background service initialized');