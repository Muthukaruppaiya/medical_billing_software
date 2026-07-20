import cron from 'node-cron';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let backupRunning = false;

/**
 * Async backup so large SQLite files (e.g. 200k+ catalog rows) do not freeze
 * the Node event loop / desktop UI.
 */
export async function performBackup() {
  if (backupRunning) {
    return { success: [], errors: ['Backup already in progress'] };
  }
  backupRunning = true;

  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
  const absoluteDbPath = path.resolve(dbPath);
  const result = { success: [], errors: [] };

  try {
    try {
      await fsp.access(absoluteDbPath);
    } catch {
      const errStr = `Database file not found at: ${absoluteDbPath}`;
      console.error(`[Backup Error] ${errStr}`);
      result.errors.push(errStr);
      return result;
    }

    const now = new Date();
    const pad = num => String(num).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupFileName = `database_backup_${timestamp}.sqlite`;

    const localDir = process.env.BACKUP_LOCAL_DIR || path.join(__dirname, '../backups');
    const targets = [
      { name: 'Local Backup', dir: localDir },
      { name: 'E Drive', dir: process.env.BACKUP_E_DRIVE_DIR || 'E:/pharmacy_backup' },
      { name: 'Google Drive Sync', dir: process.env.BACKUP_G_DRIVE_DIR || 'G:/My Drive/pharmacy_backup' },
    ];

    for (const target of targets) {
      try {
        await fsp.mkdir(target.dir, { recursive: true });
        const destPath = path.join(target.dir, backupFileName);
        await fsp.copyFile(absoluteDbPath, destPath);
        console.log(`[Backup Success] Successfully backed up to ${target.name}: ${destPath}`);
        result.success.push({ target: target.name, path: destPath });
      } catch (err) {
        const errMsg = `Failed to backup to ${target.name} (${target.dir}): ${err.message}`;
        console.error(`[Backup Warning] ${errMsg}`);
        result.errors.push(errMsg);
      }
    }
  } finally {
    backupRunning = false;
  }

  return result;
}

export function startBackupJob() {
  cron.schedule('0 */6 * * *', () => {
    console.log('[Backup Cron] Starting scheduled database backup...');
    performBackup().catch(err => console.error('[Backup Cron] Failed:', err));
  });
  console.log('[Backup Cron] Backup job scheduled to run every 6 hours.');

  const startupDelay = Number(process.env.BACKUP_STARTUP_DELAY_MS) || 60000;
  setTimeout(() => {
    console.log('[Backup Startup] Performing initial startup verification backup...');
    performBackup().catch(err => console.error('[Backup Startup] Failed:', err));
  }, startupDelay);
}
