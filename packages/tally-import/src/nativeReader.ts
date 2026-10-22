import fs from 'node:fs';
import path from 'node:path';

export interface DetectionResult {
  kind:
    | 'TALLY_BACKUP_FILE'
    | 'TALLY_DATA_FILE'
    | 'TALLY_COMPANY_FOLDER'
    | 'TALLY_XML_FILE'
    | 'UNKNOWN';
  companyName?: string;
  companyNumber?: string;
  guidance: string;
}

export interface TallyNativeReader {
  detect(targetPath: string): Promise<DetectionResult>;
}

/**
 * Tally's own data files inside a company folder.
 *
 * Tally splits a company's data across numbered files — ".001" holds the
 * masters and ledgers, ".002" the vouchers — using a proprietary binary
 * format that carries no published specification and no self-describing
 * header. The bytes are not compressed, so the names are readable as
 * UTF-16, but the record framing around them is not.
 */
const TALLY_DATA_FILE = /^\.\d{3}$/;

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
      const base = path.basename(targetPath).toLowerCase();

      if (ext === '.900' || ext === '.imp' || base === 'tally.imp') {
        return {
          kind: 'TALLY_BACKUP_FILE',
          guidance:
            'This is a native Tally ERP backup file (.900/Tally.imp). Because Tally proprietary binary backups use version-specific proprietary compression and encryption, please restore this backup in Tally ERP 9 first, then choose Gateway of Tally -> Export -> Masters/Vouchers -> XML format, and import that XML file here.',
        };
      }

      if (TALLY_DATA_FILE.test(ext)) {
        return {
          kind: 'TALLY_DATA_FILE',
          guidance:
            `This is a native Tally ERP data file (${path.basename(targetPath)}) from a company folder. ` +
            'Tally stores its data in a proprietary binary format with no published specification, so it cannot be read directly. ' +
            'To bring this data into LedgerDesk, either:\n' +
            '  1. Open the company in Tally ERP 9, press F12 -> Advanced Configurations -> "Tally acts as" and set it to "Both" or "Server", ' +
            'then use the "Tally XML Server" tab here to import directly over the network; or\n' +
            '  2. In Tally use Gateway of Tally -> Export -> Data -> XML to export Masters and Day Book, then use the "Import Tally XML" tab here.',
        };
      }

      if (ext === '.xml') {
        return {
          kind: 'TALLY_XML_FILE',
          guidance:
            'This is a Tally XML export. Use the "Import Tally XML" tab and pick this file — LedgerDesk streams it straight from disk, so large Day Book exports are fine.',
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
