// backend/backupManager.js
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const Docker = require('node-docker-api').Docker;
const branding = require('./pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

// Constants - with better path configuration
const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';
// This should be the directory where your docker-compose.yml and config directory are located
const PANGOLIN_ROOT_DIR = process.env.PANGOLIN_ROOT_DIR || '/root';
const ITEMS_TO_BACKUP = ['docker-compose.yml', 'config'];
const MAX_BACKUPS = 10; // Maximum number of backups to keep

/**
 * Ensures the backup directory exists
 */
async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    return true;
  } catch (error) {
    console.error(`${branding.consoleHeader} Error creating backup directory:`, error.message);
    return false;
  }
}

/**
 * Get list of available backups
 */
async function listBackups() {
  try {
    await ensureBackupDir();
    
    // Read backup directory
    const files = await fs.readdir(BACKUP_DIR);
    
    // Filter for backup files (tar.gz)
    const backups = files
      .filter(file => file.startsWith('pangolin_backup_') && file.endsWith('.tar.gz'))
      .sort()
      .reverse(); // Newest first
    
    return { success: true, backups };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error listing backups:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create a backup of the Pangolin stack
 */
async function createBackup() {
  try {
    await ensureBackupDir();
    
    // Generate timestamp for the backup
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupName = `pangolin_backup_${timestamp}`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    // Create backup directory
    await fs.mkdir(backupPath, { recursive: true });
    
    // Get running container information to include in backup
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    const containers = await docker.container.list();
    const containerInfo = containers.map(c => ({
      name: c.data.Names[0].slice(1),
      image: c.data.Image,
      status: c.data.Status
    }));
    
    // Write container info to backup
    await fs.writeFile(
      path.join(backupPath, 'container_info.json'), 
      JSON.stringify(containerInfo, null, 2)
    );
    
    // Write backup info
    await fs.writeFile(
      path.join(backupPath, 'backup_info.json'),
      JSON.stringify({
        timestamp,
        createdAt: new Date().toISOString(),
        items: ITEMS_TO_BACKUP,
        sourceDir: PANGOLIN_ROOT_DIR
      }, null, 2)
    );
    
    console.log(`${branding.consoleHeader} Creating backup from directory: ${PANGOLIN_ROOT_DIR}`);
    
    // Verify source directory exists
    try {
      await fs.access(PANGOLIN_ROOT_DIR);
    } catch (error) {
      throw new Error(`Pangolin root directory not found at ${PANGOLIN_ROOT_DIR}: ${error.message}`);
    }
    
    // Build the tar command with the correct source directory
    const tarCommand = `cd "${PANGOLIN_ROOT_DIR}" && tar -czf "${path.join(BACKUP_DIR, backupName)}.tar.gz" ${ITEMS_TO_BACKUP.join(' ')} 2>/dev/null`;
    console.log(`${branding.consoleHeader} Running command: ${tarCommand}`);
    
    await execPromise(tarCommand);
    
    // Clean up temporary directory
    await fs.rm(backupPath, { recursive: true, force: true });
    
    // Clean up old backups if we have too many
    await cleanupOldBackups();
    
    return {
      success: true,
      backupName: `${backupName}.tar.gz`,
      timestamp,
      path: path.join(BACKUP_DIR, `${backupName}.tar.gz`)
    };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error creating backup:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up old backups, keeping only the newest MAX_BACKUPS
 */
async function cleanupOldBackups() {
  try {
    const { success, backups } = await listBackups();
    
    if (!success || backups.length <= MAX_BACKUPS) {
      return;
    }
    
    // Delete old backups (keep the newest MAX_BACKUPS)
    const backupsToDelete = backups.slice(MAX_BACKUPS);
    
    for (const backup of backupsToDelete) {
      await fs.unlink(path.join(BACKUP_DIR, backup));
      console.log(`${branding.consoleHeader} Deleted old backup: ${backup}`);
    }
  } catch (error) {
    console.error(`${branding.consoleHeader} Error cleaning up old backups:`, error.message);
  }
}

/**
 * Extract backup information
 */
async function getBackupInfo(backupName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    // Check if backup exists
    try {
      await fs.access(backupPath);
    } catch {
      return { success: false, error: 'Backup not found' };
    }
    
    // Extract info from filename
    const timestampMatch = backupName.match(/pangolin_backup_(.+)\.tar\.gz/);
    const timestamp = timestampMatch ? timestampMatch[1] : 'Unknown';
    
    // Get file size
    const stats = await fs.stat(backupPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    // Try to parse date
    let createdAt;
    try {
      createdAt = new Date(timestamp.replace(/-/g, ':')).toISOString();
    } catch (e) {
      createdAt = new Date().toISOString();
    }
    
    return {
      success: true,
      info: {
        name: backupName,
        timestamp,
        createdAt,
        size: `${sizeInMB} MB`
      }
    };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error getting backup info:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Restore from a backup
 */
async function restoreBackup(backupName) {
    try {
      const backupPath = path.join(BACKUP_DIR, backupName);
      
      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch {
        return { success: false, error: 'Backup not found' };
      }
      
      // Verify the target directory (PANGOLIN_ROOT_DIR) exists
      try {
        await fs.access(PANGOLIN_ROOT_DIR);
      } catch (error) {
        throw new Error(`Pangolin root directory not found at ${PANGOLIN_ROOT_DIR}: ${error.message}`);
      }
      
      // Create backup of current configuration before overwriting
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const preRestoreBackup = `pre_restore_${timestamp}.tar.gz`;
      const backupCommand = `cd "${PANGOLIN_ROOT_DIR}" && tar -czf "${path.join(BACKUP_DIR, preRestoreBackup)}" ${ITEMS_TO_BACKUP.join(' ')} 2>/dev/null`;
      
      console.log(`${branding.consoleHeader} Creating pre-restore backup: ${backupCommand}`);
      await execPromise(backupCommand);
      
      // Create a temporary directory for extraction
      const tempDir = path.join('/tmp', `pangolin_restore_${timestamp}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      try {
        // First extract to temp directory
        const tempExtractCmd = `tar -xzf "${backupPath}" -C "${tempDir}"`;
        console.log(`${branding.consoleHeader} Extracting backup to temp dir: ${tempExtractCmd}`);
        await execPromise(tempExtractCmd);
        
        // Now for each item in the backup, replace it in the target
        for (const item of ITEMS_TO_BACKUP) {
          const sourceItem = path.join(tempDir, item);
          const targetItem = path.join(PANGOLIN_ROOT_DIR, item);
          
          try {
            // Check if this item exists in the backup
            await fs.access(sourceItem);
            
            // Remove existing item in target location
            try {
              console.log(`${branding.consoleHeader} Removing existing item: ${targetItem}`);
              await execPromise(`rm -rf "${targetItem}"`);
            } catch (e) {
              console.log(`${branding.consoleHeader} Target doesn't exist or can't be removed: ${e.message}`);
            }
            
            // Create parent directory if needed
            await fs.mkdir(path.dirname(targetItem), { recursive: true });
            
            // Copy from temp to target
            console.log(`${branding.consoleHeader} Copying ${sourceItem} to ${targetItem}`);
            await execPromise(`cp -a "${sourceItem}" "${targetItem}"`);
          } catch (e) {
            console.log(`${branding.consoleHeader} Item ${item} not found in backup, skipping: ${e.message}`);
          }
        }
      } finally {
        // Clean up temp directory
        try {
          await execPromise(`rm -rf "${tempDir}"`);
        } catch (e) {
          console.log(`${branding.consoleHeader} Error cleaning up temp dir: ${e.message}`);
        }
      }
      
      return {
        success: true,
        preRestoreBackup,
        message: `Restored from backup: ${backupName}. A backup of the previous configuration was created: ${preRestoreBackup}`
      };
    } catch (error) {
      console.error(`${branding.consoleHeader} Error restoring backup:`, error.message);
      return { success: false, error: error.message };
    }
  }
  
/**
 * Delete a specific backup
 */
async function deleteBackup(backupName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    // Check if backup exists
    try {
      await fs.access(backupPath);
    } catch {
      return { success: false, error: 'Backup not found' };
    }
    
    // Delete the backup
    await fs.unlink(backupPath);
    
    return { success: true, message: `Backup ${backupName} deleted successfully` };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error deleting backup:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  listBackups,
  createBackup,
  getBackupInfo,
  restoreBackup,
  deleteBackup
};