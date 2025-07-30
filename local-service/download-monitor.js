// local-service/download-monitor.js

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class DownloadMonitor {
  constructor() {
    this.projectRoot = null;
    this.pendingDownloads = new Map();
    this.monitoring = false;
    this.watchInterval = null;
    this.downloadDir = null;
  }

  /**
   * Set project root and initialize download monitoring
   */
  setProjectRoot(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
    this.downloadDir = path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads');
    console.log(chalk.blue(`📁 Download monitoring initialized for: ${this.downloadDir}`));
  }

  /**
   * Start monitoring downloads directory
   */
  start() {
    if (this.monitoring) {
      console.log(chalk.yellow('⚠️ Download monitoring already active'));
      return;
    }

    if (!this.downloadDir) {
      console.log(chalk.yellow('⚠️ Download directory not set, monitoring disabled'));
      return;
    }

    this.monitoring = true;
    console.log(chalk.green(`🔍 Starting download monitoring for: ${this.downloadDir}`));

    // Check for pending downloads every 2 seconds
    this.watchInterval = setInterval(() => {
      this.checkPendingDownloads();
    }, 2000);
  }

  /**
   * Stop monitoring downloads directory
   */
  stop() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    this.monitoring = false;
    console.log(chalk.yellow('🛑 Download monitoring stopped'));
  }

  /**
   * Add a pending download to monitor
   */
  addPendingDownload(filename, timestamp, options = {}) {
    const key = `${filename}_${timestamp}`;
    this.pendingDownloads.set(key, {
      filename,
      timestamp,
      addedAt: Date.now(),
      options
    });
    
    console.log(chalk.blue(`📋 Added to pending downloads: ${filename}`));
    return key;
  }

  /**
   * Get all pending downloads
   */
  getPendingDownloads() {
    return Array.from(this.pendingDownloads.values());
  }

  /**
   * Clear all pending downloads
   */
  clearPendingDownloads() {
    const count = this.pendingDownloads.size;
    this.pendingDownloads.clear();
    console.log(chalk.blue(`🧹 Cleared ${count} pending downloads`));
  }

  /**
   * Check for completed downloads
   */
  async checkPendingDownloads() {
    if (!this.monitoring || this.pendingDownloads.size === 0) {
      return;
    }

    try {
      const files = await fs.readdir(this.downloadDir);
      
      for (const [key, download] of this.pendingDownloads) {
        const filePath = path.join(this.downloadDir, download.filename);
        
        if (await fs.pathExists(filePath)) {
          console.log(chalk.green(`✅ Found completed download: ${download.filename}`));
          
          // Process the file
          await this.processDownloadedFile(download);
          
          // Remove from pending
          this.pendingDownloads.delete(key);
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error checking downloads:'), error.message);
    }
  }

  /**
   * Process a downloaded file
   */
  async processDownloadedFile(download) {
    try {
      const { filename, options } = download;
      const filePath = path.join(this.downloadDir, filename);
      
      if (!options.processor || !options.fileManager) {
        console.log(chalk.yellow(`⚠️ No processor available for: ${filename}`));
        return;
      }

      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Process with artifact processor
      const processedContent = await options.processor.processArtifact({
        type: 'file',
        filename,
        content
      });

      if (processedContent) {
        // Write to project using file manager
        await options.fileManager.writeFile(filename, processedContent, {
          createBackup: true
        });
        
        console.log(chalk.green(`✅ Processed and saved: ${filename}`));
      }
      
    } catch (error) {
      console.error(chalk.red(`❌ Error processing download: ${download.filename}`), error.message);
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      monitoring: this.monitoring,
      pendingCount: this.pendingDownloads.size,
      downloadDir: this.downloadDir,
      projectRoot: this.projectRoot
    };
  }
}

module.exports = DownloadMonitor;