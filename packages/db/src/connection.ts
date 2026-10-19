import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export interface OpenDatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
}

export function openDatabase(dbPath: string, options: OpenDatabaseOptions = {}): Db {
  const dir = path.dirname(dbPath);
  if (!options.fileMustExist) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath, {
    readonly: options.readonly ?? false,
    fileMustExist: options.fileMustExist ?? false,
  });

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  return db;
}

export function integrityCheck(db: Db): { ok: boolean; message: string } {
  const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  const message = row.integrity_check;
  return { ok: message === 'ok', message };
}

export function closeDatabase(db: Db): void {
  db.close();
}
