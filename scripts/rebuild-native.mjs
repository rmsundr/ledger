#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] ?? 'electron';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addonDir = path.join(root, 'node_modules', 'better-sqlite3');

const args =
  mode === 'node'
    ? ['node-gyp', 'rebuild', '--release']
    : [
        'node-gyp',
        'rebuild',
        '--release',
        '--target=33.4.11',
        '--arch=x64',
        '--dist-url=https://electronjs.org/headers',
      ];

console.log(`[ledgerdesk] rebuilding better-sqlite3 for ${mode}…`);
const result = spawnSync('npx', args, {
  cwd: addonDir,
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
