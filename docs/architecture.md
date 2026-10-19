# LedgerDesk Architecture

## Overview

LedgerDesk is a local-first desktop ERP. The UI never talks to SQLite directly.

```
React UI  →  preload (contextBridge)  →  IPC (Zod-validated)
        →  service layer (@ledgerdesk/core)
        →  repository layer (@ledgerdesk/db)
        →  SQLite (better-sqlite3, WAL, foreign_keys=ON)
```

## Packages

| Package | Role |
|---------|------|
| `apps/desktop` | Electron main/preload + React renderer |
| `packages/core` | Pure domain services and Zod schemas |
| `packages/db` | Schema, migrations, repositories, seeds |
| `packages/reports` | Report definitions (Phase 2+) |
| `packages/tally-import` | Tally XML/live import (Phase 7) |

## Data layout

User data directory (Electron `userData/data`):

- `registry.db` — list of companies and paths
- `companies/<slug>-<id>.db` — one SQLite file per company

## Security (Phase 1 baseline)

- `contextIsolation: true`, `nodeIntegration: false`, sandboxed preload
- CSP locked to `self`
- No outbound network from the app shell
- IPC payloads validated with Zod in the main process

## Money

All currency amounts are stored as **integer minor units** (paise). Helpers live in `@ledgerdesk/db` (`toMinorUnits` / `fromMinorUnits`). Floating-point arithmetic is forbidden for money.
