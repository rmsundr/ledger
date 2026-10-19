/// <reference types="vite/client" />

import type { LedgerDeskApi } from '../electron/preload';

declare global {
  interface Window {
    ledgerdesk: LedgerDeskApi;
  }
}

export {};
