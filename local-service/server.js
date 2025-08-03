// local-service/server.js

const express = require('express');
const cors = require('cors');
const chalk = require('chalk');
const ArtifactProcessor = require('./artifact-processor');
const DownloadMonitor = require('./download-monitor');
const FileManager = require('./file-manager');

class ClaudeCodeExtractorService {
  constructor(port = 3030) {
    this.port = port;
    this.app = express();
    this.projectRoot = null;
    
    // Initialize components
    this.artifactProcessor = new ArtifactProcessor();
    this.downloadMonitor = new DownloadMonitor();
    this.fileManager = new FileManager();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Enable CORS for all origins (fully permissive)
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(chalk.blue(`${new Date().toISOString()} - ${req.method} ${req.path}`));
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        version: '1.0.0',
        projectRoot: this.projectRoot,
        uptime: process.uptime(),
        pendingDownloads: this.downloadMonitor.getPendingDownloads(),
        lastActivity: new Date().toISOString()
      });
    });

    // Set project root directory
    this.app.post('/api/set-project', async (req, res) => {
      try {
        const { projectRoot } = req.body;
        
        if (!projectRoot || typeof projectRoot !== 'string') {
          return res.status(400).json({ 
            error: 'Project root path is required and must be a string' 
          });
        }

        // Validate and set project root
        await this.fileManager.setProjectRoot(projectRoot);
        this.projectRoot = projectRoot;
        
        // Update download monitor with new project root
        this.downloadMonitor.setProjectRoot(projectRoot);
        
        console.log(chalk.green(`📁 Project root set to: ${projectRoot}`));
        
        res.json({ 
          success: true, 
          projectRoot: this.projectRoot,
          message: 'Project root set successfully'
        });
        
      } catch (error) {
        console.error(chalk.red('❌ Failed to set project root:'), error.message);
        res.status(500).json({ 
          error: error.message,
          details: 'Failed to set project root directory'
        });
      }
    });

    // Main artifact processing endpoint
    this.app.post('/api/process-artifact', async (req, res) => {
      try {
        const { type, data } = req.body;
        
        if (!this.projectRoot) {
          return res.status(400).json({ 
            error: 'Project root not set. Please set project root first.' 
          });
        }

        let result;
        
        if (type === 'ARTIFACT_DETECTED') {
          // Handle successful blob interception
          result = await this.handleBlobInterception(data);
        } else if (type === 'BLOB_EXTRACTION_FAILED') {
          // Handle download fallback
          result = await this.handleDownloadFallback(data);
        } else {
          return res.status(400).json({ 
            error: `Unknown request type: ${type}` 
          });
        }
        
        res.json(result);
        
      } catch (error) {
        console.error(chalk.red('❌ Error processing artifact:'), error.message);
        res.status(500).json({ 
          error: error.message,
          details: 'Failed to process artifact'
        });
      }
    });

    // Get extraction statistics
    this.app.get('/api/stats', (req, res) => {
      res.json({
        projectRoot: this.projectRoot,
        totalProcessed: this.artifactProcessor.getTotalProcessed(),
        successfulExtractions: this.artifactProcessor.getSuccessfulExtractions(),
        failedExtractions: this.artifactProcessor.getFailedExtractions(),
        pendingDownloads: this.downloadMonitor.getPendingDownloads()
      });
    });

    // Clear pending downloads
    this.app.post('/api/clear-pending', (req, res) => {
      this.downloadMonitor.clearPendingDownloads();
      res.json({ success: true, message: 'Pending downloads cleared' });
    });
  }

  async handleBlobInterception(data) {
    const { filePath, content, language, originalFilename } = data;
    
    console.log(chalk.yellow(`📥 Processing blob interception: ${filePath}`));
    
    // Process the artifact content
    const processedResult = await this.artifactProcessor.processContent(
      content, 
      filePath, 
      language
    );
    
    // Write to file system
    const result = await this.fileManager.writeFile(
      processedResult.filePath, 
      processedResult.content, 
      { createBackup: true }
    );
    
    console.log(chalk.green(`✅ Successfully written: ${filePath}`));
    
    return {
      success: true,
      method: 'blob_interception',
      filePath: result.filePath,
      absolutePath: result.absolutePath,
      backupCreated: result.backupCreated,
      message: `File written successfully via blob interception`
    };
  }

  async handleDownloadFallback(data) {
    const { filename, timestamp } = data;
    
    console.log(chalk.yellow(`⏳ Setting up download monitoring for: ${filename}`));
    
    // Register for download monitoring
    this.downloadMonitor.addPendingDownload(filename, timestamp, {
      processor: this.artifactProcessor,
      fileManager: this.fileManager
    });
    
    return {
      success: true,
      method: 'download_fallback',
      filename,
      message: `Download monitoring setup for ${filename}`
    };
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /api/status',
          'POST /api/set-project',
          'POST /api/process-artifact',
          'GET /api/stats',
          'POST /api/clear-pending'
        ]
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error(chalk.red('💥 Unhandled error:'), error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Shutting down service...'));
      this.downloadMonitor.stop();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      console.error(chalk.red('💥 Uncaught Exception:'), error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error(chalk.red('💥 Unhandled Rejection at:'), promise, 'reason:', reason);
      process.exit(1);
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(chalk.green.bold(`🚀 Claude Code Extractor Service started!`));
      console.log(chalk.blue(`📡 Server running on http://localhost:${this.port}`));
      console.log(chalk.blue(`🔍 Download monitoring active`));
      console.log(chalk.yellow(`📁 Project root: ${this.projectRoot || 'Not set'}`));
      console.log(chalk.gray(`💡 Load the browser extension and start extracting!`));
      
      // Start download monitoring
      this.downloadMonitor.start();
    });
  }
}

// Start the service
if (require.main === module) {
  const service = new ClaudeCodeExtractorService();
  service.start();
}

module.exports = ClaudeCodeExtractorService;