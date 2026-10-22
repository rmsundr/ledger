import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { Db } from '@ledgerdesk/db';
import { newId } from '@ledgerdesk/db';

const joinPath = path.join;

export interface BackupResult {
  id: string;
  path: string;
  checksum: string;
  createdAt: string;
  sizeBytes: number;
}

export class BackupService {
  constructor(private readonly dbPath: string, private readonly backupDir: string, private readonly db: Db) {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }

  createBackup(note = 'Manual backup'): BackupResult {
    // Ensure WAL checkpoint or flush before copying
    this.db.pragma('wal_checkpoint(FULL)');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `ledgerdesk-backup-${timestamp}.db`;
    const destPath = joinPath(this.backupDir, backupFileName);

    fs.copyFileSync(this.dbPath, destPath);

    const fileBuffer = fs.readFileSync(destPath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = fs.statSync(destPath);

    const backupId = newId();
    const createdAt = new Date().toISOString();

    // Log in backup_log table if exists
    try {
      this.db.prepare(`
        INSERT INTO backup_log (id, company_id, path, checksum, created_at, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(backupId, 'default', destPath, checksum, createdAt, note);
    } catch {
      // table might not exist in older schema version
    }

    return {
      id: backupId,
      path: destPath,
      checksum,
      createdAt,
      sizeBytes: stats.size,
    };
  }

  listBackups(): { id: string; path: string; checksum: string; createdAt: string }[] {
    try {
      return this.db.prepare(`SELECT id, path, checksum, created_at as createdAt FROM backup_log ORDER BY created_at DESC`).all() as any[];
    } catch {
      // Fallback to scanning directory
      if (!fs.existsSync(this.backupDir)) return [];
      const files = fs.readdirSync(this.backupDir).filter(f => f.endsWith('.db'));
      return files.map(f => {
        const fullPath = joinPath(this.backupDir, f);
        const stats = fs.statSync(fullPath);
        return {
          id: f,
          path: fullPath,
          checksum: '',
          createdAt: stats.mtime.toISOString(),
        };
      });
    }
  }

  restoreBackup(backupPath: string): void {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found at ${backupPath}`);
    }
    // Verify SQLite header or basic integrity
    const buf = fs.readFileSync(backupPath);
    if (buf.length < 16 || buf.toString('utf8', 0, 16) !== 'SQLite format 3\0') {
      throw new Error('Invalid SQLite database backup file');
    }

    // Close current connections and overwrite dbPath
    this.db.close();
    fs.copyFileSync(backupPath, this.dbPath);
  }
}
