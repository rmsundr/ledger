import fs from 'node:fs';
import path from 'node:path';

export interface DetectionResult {
  kind: 'TALLY_BACKUP_FILE' | 'TALLY_COMPANY_FOLDER' | 'UNKNOWN';
  companyName?: string;
  companyNumber?: string;
  guidance: string;
}

export interface TallyNativeReader {
  detect(targetPath: string): Promise<DetectionResult>;
}

export class DefaultTallyNativeReader implements TallyNativeReader {
  async detect(targetPath: string): Promise<DetectionResult> {
    if (!fs.existsSync(targetPath)) {
      return {
        kind: 'UNKNOWN',
        guidance: `Path does not exist: ${targetPath}`,
      };
    }

    const stat = fs.statSync(targetPath);

    if (stat.isFile()) {
      const ext = path.extname(targetPath).toLowerCase();
      if (ext === '.900' || ext === '.imp' || path.basename(targetPath).toLowerCase() === 'tally.imp') {
        return {
          kind: 'TALLY_BACKUP_FILE',
          guidance:
            'This is a native Tally ERP backup file (.900/Tally.imp). Because Tally proprietary binary backups use version-specific proprietary compression and encryption, please restore this backup in Tally ERP 9 first, then choose Gateway of Tally -> Export -> Masters/Vouchers -> XML format, and import that XML file here.',
        };
      }
    }

    if (stat.isDirectory()) {
      const base = path.basename(targetPath);
      // Tally company folders are 5-digit numbers like "10000", "10001"
      if (/^\d{5}$/.test(base)) {
        return {
          kind: 'TALLY_COMPANY_FOLDER',
          companyNumber: base,
          guidance: `Detected Tally Company folder (${base}). To import cleanly, open this company in Tally ERP 9, enable the XML server (F12 -> Advanced Configurations -> Tally acts as: Both / port 9000), or export XML files via Gateway of Tally -> Export -> Data -> XML.`,
        };
      }
    }

    return {
      kind: 'UNKNOWN',
      guidance:
        'Unrecognized format. Please provide a standard Tally XML export file (Gateway of Tally -> Export -> Data -> XML), or connect via the live XML server.',
    };
  }
}
