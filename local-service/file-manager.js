// local-service/file-manager.js

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class FileManager {
  constructor() {
    this.projectRoot = null;
    this.backupDir = null;
    this.fileStats = {
      filesWritten: 0,
      backupsCreated: 0,
      directoriesCreated: 0,
      totalBytes: 0
    };
  }

  /**
   * Set and validate project root directory
   */
  async setProjectRoot(projectRoot) {
    try {
      // Resolve absolute path
      const absolutePath = path.resolve(projectRoot);
      
      // Check if directory exists, create if it doesn't
      await fs.ensureDir(absolutePath);
      
      // Verify we can write to it
      const testFile = path.join(absolutePath, '.claude-extractor-test');
      await fs.writeFile(testFile, 'test');
      await fs.remove(testFile);
      
      this.projectRoot = absolutePath;
      this.backupDir = path.join(absolutePath, '.claude-backups');
      
      // Ensure backup directory exists
      await fs.ensureDir(this.backupDir);
      
      console.log(chalk.green(`📁 Project root set: ${this.projectRoot}`));
      console.log(chalk.blue(`💾 Backup directory: ${this.backupDir}`));
      
      return this.projectRoot;
      
    } catch (error) {
      throw new Error(`Failed to set project root: ${error.message}`);
    }
  }

  /**
   * Write file to project with backup and directory creation
   */
  async writeFile(filePath, content, options = {}) {
    if (!this.projectRoot) {
      throw new Error('Project root not set');
    }

    const {
      createBackup = true,
      overwrite = true,
      encoding = 'utf8'
    } = options;

    try {
      // Resolve absolute file path
      const absolutePath = this.resolveFilePath(filePath);
      
      // Ensure directory structure exists
      const directory = path.dirname(absolutePath);
      await fs.ensureDir(directory);
      
      // Check if this creates a new directory
      if (!await fs.pathExists(directory)) {
        this.fileStats.directoriesCreated++;
      }

      // Create backup if file exists and backup is requested
      let backupPath = null;
      if (createBackup && await fs.pathExists(absolutePath)) {
        backupPath = await this.createBackup(absolutePath);
      }

      // Check if file exists and overwrite is disabled
      if (!overwrite && await fs.pathExists(absolutePath)) {
        throw new Error(`File already exists and overwrite is disabled: ${filePath}`);
      }

      // Write the file
      await fs.writeFile(absolutePath, content, encoding);
      
      // Update statistics
      this.fileStats.filesWritten++;
      this.fileStats.totalBytes += Buffer.byteLength(content, encoding);
      
      const result = {
        success: true,
        filePath,
        absolutePath,
        backupCreated: !!backupPath,
        backupPath,
        size: Buffer.byteLength(content, encoding),
        timestamp: new Date().toISOString()
      };

      console.log(chalk.green(`✅ Written: ${filePath} (${this.formatBytes(result.size)})`));
      if (backupPath) {
        console.log(chalk.blue(`💾 Backup: ${path.basename(backupPath)}`));
      }

      return result;

    } catch (error) {
      console.error(chalk.red(`❌ Failed to write ${filePath}:`), error.message);
      throw error;
    }
  }

  /**
   * Create backup of existing file
   */
  async createBackup(filePath) {
    try {
      const fileName = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${fileName}.backup.${timestamp}`;
      const backupPath = path.join(this.backupDir, backupFileName);

      await fs.copy(filePath, backupPath);
      this.fileStats.backupsCreated++;

      return backupPath;

    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to create backup for ${filePath}:`, error.message));
      return null;
    }
  }

  /**
   * Resolve file path relative to project root
   */
  resolveFilePath(filePath) {
    // Remove leading slash if present
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    return path.join(this.projectRoot, cleanPath);
  }

  /**
   * Check if file exists in project
   */
  async fileExists(filePath) {
    const absolutePath = this.resolveFilePath(filePath);
    return await fs.pathExists(absolutePath);
  }

  /**
   * Read file from project
   */
  async readFile(filePath, encoding = 'utf8') {
    const absolutePath = this.resolveFilePath(filePath);
    return await fs.readFile(absolutePath, encoding);
  }

  /**
   * List files in project directory
   */
  async listFiles(directory = '', options = {}) {
    const {
      recursive = false,
      extensions = null, // Array of extensions to filter by
      excludeDirs = ['.git', 'node_modules', '.claude-backups']
    } = options;

    const targetDir = directory ? this.resolveFilePath(directory) : this.projectRoot;
    
    if (!await fs.pathExists(targetDir)) {
      return [];
    }

    const files = [];
    
    const processDirectory = async (dir, relativePath = '') => {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const relativeItemPath = path.join(relativePath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          if (!excludeDirs.includes(item) && recursive) {
            await processDirectory(itemPath, relativeItemPath);
          }
        } else {
          // Filter by extensions if specified
          if (!extensions || extensions.includes(path.extname(item))) {
            files.push({
              name: item,
              path: relativeItemPath,
              absolutePath: itemPath,
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }
    };

    await processDirectory(targetDir);
    return files;
  }

  /**
   * Get project structure as tree
   */
  async getProjectStructure(maxDepth = 3) {
    if (!this.projectRoot) {
      return null;
    }

    const buildTree = async (dir, currentDepth = 0) => {
      if (currentDepth >= maxDepth) {
        return null;
      }

      try {
        const items = await fs.readdir(dir);
        const tree = {};

        for (const item of items) {
          // Skip hidden files and common ignore patterns
          if (item.startsWith('.') || item === 'node_modules') {
            continue;
          }

          const itemPath = path.join(dir, item);
          const stats = await fs.stat(itemPath);

          if (stats.isDirectory()) {
            const subtree = await buildTree(itemPath, currentDepth + 1);
            if (subtree) {
              tree[item] = { type: 'directory', children: subtree };
            } else {
              tree[item] = { type: 'directory', children: {} };
            }
          } else {
            tree[item] = { 
              type: 'file', 
              size: stats.size,
              modified: stats.mtime 
            };
          }
        }

        return tree;
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Cannot read directory ${dir}:`, error.message));
        return {};
      }
    };

    return await buildTree(this.projectRoot);
  }

  /**
   * Clean up old backup files
   */
  async cleanupBackups(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    if (!this.backupDir || !await fs.pathExists(this.backupDir)) {
      return { removed: 0, errors: 0 };
    }

    const cutoffTime = Date.now() - maxAge;
    let removed = 0;
    let errors = 0;

    try {
      const backupFiles = await fs.readdir(this.backupDir);
      
      for (const file of backupFiles) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          try {
            await fs.remove(filePath);
            removed++;
            console.log(chalk.blue(`🗑️ Removed old backup: ${file}`));
          } catch (error) {
            errors++;
            console.warn(chalk.yellow(`⚠️ Failed to remove backup ${file}:`, error.message));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to cleanup backups:`, error.message));
      errors++;
    }

    return { removed, errors };
  }

  /**
   * Get file statistics
   */
  getStats() {
    return {
      ...this.fileStats,
      projectRoot: this.projectRoot,
      backupDir: this.backupDir
    };
  }

  /**
   * Reset file statistics
   */
  resetStats() {
    this.fileStats = {
      filesWritten: 0,
      backupsCreated: 0,
      directoriesCreated: 0,
      totalBytes: 0
    };
  }

  /**
   * Format bytes for human-readable display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Validate file path for security
   */
  validateFilePath(filePath) {
    // Prevent path traversal attacks
    const normalizedPath = path.normalize(filePath);
    
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
      throw new Error('Invalid file path: path traversal not allowed');
    }
    
    return true;
  }
}

module.exports = FileManager;