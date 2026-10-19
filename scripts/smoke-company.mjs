import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CompanyService } from '../packages/core/dist/index.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-smoke-'));
const svc = new CompanyService(dir);
const created = svc.createCompany({
  name: 'Smoke Test Co',
  financialYearBegin: '2025-04-01',
  booksBegin: '2025-04-01',
  state: 'Kerala',
});
const session = svc.openCompany(created.registryId, '2025-10-19');
console.log(
  JSON.stringify(
    {
      ok: true,
      company: session.company.name,
      groups: session.groups.length,
      voucherTypesOk: session.groups.length >= 28,
      featuresGst: session.features.gst,
      dataDir: dir,
    },
    null,
    2,
  ),
);
svc.dispose();
fs.rmSync(dir, { recursive: true, force: true });
