# LedgerDesk

Local-first accounting and inventory ERP for personal use (functional equivalent of Tally ERP 9 workflows). Runs 100% offline on your machine.

**Phase 1 (Foundation) is implemented:** Electron + React shell, SQLite per company, migrations, company create/select, Gateway screen, keyboard framework, F11/F12.

## Requirements

- Node.js 20+
- Linux, macOS, or Windows
- Build tools for `better-sqlite3` (Python + C++ toolchain)

On Fedora:

```bash
sudo dnf install python3 make gcc-c++
```

## Setup

```bash
cd /home/ramsunder/Documents/ledger
# If better-sqlite3 fails to compile: pip3 install --user setuptools
npm install
npm approve-scripts better-sqlite3 electron esbuild   # if npm blocks install scripts
npm run rebuild:electron
npm run build -w @ledgerdesk/db
npm run build -w @ledgerdesk/core
```

## Run (development)

```bash
npm run dev
```

This rebuilds the SQLite native addon for Electron, then starts Vite + Electron.
Create a company (Alt+C), then explore the Gateway.

## Test

```bash
npm test
```

`npm test` rebuilds `better-sqlite3` for system Node first (Electron and Node use different ABIs).

## Project layout

See [docs/architecture.md](docs/architecture.md).

## Phases

1. Foundation — **done**
2. Accounting masters + vouchers + core reports
3. Bill-wise, cost centres, BRS, interest
4. Inventory
5. GST / TDS / TCS / fixed assets
6. Payroll
7. Tally import
8. Backup, security, packaging, manuals
