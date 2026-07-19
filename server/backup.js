import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to perform the backup
export function performBackup() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
  
  // Resolve absolute path for database file
  const absoluteDbPath = path.resolve(dbPath);

  const result = { success: [], errors: [] };

  if (!fs.existsSync(absoluteDbPath)) {
    const errStr = `Database file not found at: ${absoluteDbPath}`;
    console.error(`[Backup Error] ${errStr}`);
    result.errors.push(errStr);
    return result;
  }

  // Generate backup timestamp: YYYY-MM-DD_HHMMSS
  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const backupFileName = `database_backup_${timestamp}.sqlite`;

  // Backup Targets from environment variables
  const targets = [
    { name: 'Local Backup', dir: path.join(__dirname, '../backups') },
    { name: 'E Drive', dir: process.env.BACKUP_E_DRIVE_DIR || 'E:/pharmacy_backup' },
    { name: 'Google Drive Sync', dir: process.env.BACKUP_G_DRIVE_DIR || 'G:/My Drive/pharmacy_backup' }
  ];

  targets.forEach((target) => {
    try {
      // Ensure target directory exists
      if (!fs.existsSync(target.dir)) {
        fs.mkdirSync(target.dir, { recursive: true });
      }

      const destPath = path.join(target.dir, backupFileName);
      fs.copyFileSync(absoluteDbPath, destPath);
      console.log(`[Backup Success] Successfully backed up to ${target.name}: ${destPath}`);
      result.success.push({ target: target.name, path: destPath });
    } catch (err) {
      const errMsg = `Failed to backup to ${target.name} (${target.dir}): ${err.message}`;
      console.error(`[Backup Warning] ${errMsg}`);
      result.errors.push(errMsg);
    }
  });
  
  return result;
}

// Start cron job
export function startBackupJob() {
  // Schedule a cron job to run every 6 hours: '0 */6 * * *'
  cron.schedule('0 */6 * * *', () => {
    console.log('[Backup Cron] Starting scheduled database backup...');
    performBackup();
  });
  console.log('[Backup Cron] Backup job scheduled to run every 6 hours.');

  // Run an initial backup 5 seconds after startup to verify targets
  setTimeout(() => {
    console.log('[Backup Startup] Performing initial startup verification backup...');
    performBackup();
  }, 5000);
}
