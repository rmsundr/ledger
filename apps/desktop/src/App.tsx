import { useCallback, useEffect, useState } from 'react';
import { ButtonBar } from './keyboard/ButtonBar';
import { KeyboardProvider, useStatusHint } from './keyboard/KeyboardProvider';
import { ConfigureScreen } from './screens/ConfigureScreen';
import { CreateCompanyScreen } from './screens/CreateCompanyScreen';
import { FeaturesScreen } from './screens/FeaturesScreen';
import { GatewayScreen } from './screens/GatewayScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { SelectCompanyScreen } from './screens/SelectCompanyScreen';
import { MastersScreen } from './screens/MastersScreen';
import { VoucherEntryScreen } from './screens/VoucherEntryScreen';
import { DayBookScreen } from './screens/DayBookScreen';
import { TrialBalanceScreen } from './screens/TrialBalanceScreen';
import { ProfitLossScreen } from './screens/ProfitLossScreen';
import { BalanceSheetScreen } from './screens/BalanceSheetScreen';
import { LedgerStatementScreen } from './screens/LedgerStatementScreen';
import { StockSummaryScreen } from './screens/StockSummaryScreen';
import { OutstandingScreen } from './screens/OutstandingScreen';
import { TallyImportScreen } from './screens/TallyImportScreen';
import type { OpenSession, Screen } from './types/session';

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function Shell() {
  const [screen, setScreen] = useState<Screen>({ id: 'select-company' });
  const [session, setSession] = useState<OpenSession | null>(null);
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [appInfo, setAppInfo] = useState<{ dataDir: string; version: string } | null>(null);
  const statusHint = useStatusHint();

  useEffect(() => {
    const theme = localStorage.getItem('ld-theme') ?? 'dark';
    const scale = localStorage.getItem('ld-font-scale') ?? '1';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--font-scale', scale);

    void window.ledgerdesk.getAppInfo().then((info) => {
      setAppInfo({ dataDir: info.dataDir, version: info.version });
    });
    void window.ledgerdesk.getDate().then((r) => setCurrentDate(r.currentDate));
  }, []);

  const openCompany = useCallback(async (registryId: string) => {
    const s = (await window.ledgerdesk.openCompany(registryId)) as OpenSession;
    setSession(s);
    setCurrentDate(s.currentDate);
    setScreen({ id: 'gateway' });
  }, []);

  const shutCompany = useCallback(async () => {
    await window.ledgerdesk.shutCompany();
    setSession(null);
    setScreen({ id: 'select-company' });
  }, []);

  const changeDate = useCallback(() => {
    const next = prompt('Voucher date (YYYY-MM-DD)', currentDate);
    if (!next) return;
    void window.ledgerdesk.setDate(next).then((r) => {
      setCurrentDate(r.currentDate);
      setSession((s) => (s ? { ...s, currentDate: r.currentDate } : s));
    });
  }, [currentDate]);

  const quit = useCallback(() => {
    void window.ledgerdesk.quit();
  }, []);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">LedgerDesk</div>
        <div className="top-meta">
          <span>{session ? session.company.name : 'No company'}</span>
          <span>
            Period:{' '}
            {session
              ? `${formatDisplayDate(session.periodBegin)} → ${formatDisplayDate(session.periodEnd)}`
              : '—'}
          </span>
          <span>Date: {formatDisplayDate(currentDate)}</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="side-panel">
          <div className="brand" style={{ marginBottom: '0.75rem' }}>
            Current company
          </div>
          {session ? (
            <>
              <div>
                <strong>{session.company.mailing_name || session.company.name}</strong>
              </div>
              <div className="muted" style={{ marginTop: '0.35rem' }}>
                {session.company.state}
                {session.company.state ? ', ' : ''}
                {session.company.country}
              </div>
              <div className="muted" style={{ marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Groups: {session.groups.length}
                <br />
                GST: {session.features.gst ? 'On' : 'Off'}
                <br />
                Inventory: {session.features.maintain_inventory ? 'On' : 'Off'}
              </div>
            </>
          ) : (
            <p className="muted">Select or create a company to begin.</p>
          )}
        </aside>

        <main className="main-pane">
          {screen.id === 'select-company' && (
            <SelectCompanyScreen
              onCreate={() => setScreen({ id: 'create-company' })}
              onOpen={openCompany}
              onQuit={quit}
            />
          )}
          {screen.id === 'create-company' && (
            <CreateCompanyScreen
              onCreated={openCompany}
              onCancel={() => setScreen({ id: 'select-company' })}
            />
          )}
          {screen.id === 'gateway' && session && (
            <GatewayScreen
              session={session}
              onNavigate={setScreen}
              onShut={() => void shutCompany()}
              onChangeDate={changeDate}
            />
          )}
          {screen.id === 'masters' && session && (
            <MastersScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
              onSelectLedger={(ledgerId) => setScreen({ id: 'ledger-statement', ledgerId })}
            />
          )}
          {screen.id === 'voucher-entry' && session && (
            <VoucherEntryScreen
              session={session}
              initialType={screen.voucherTypeName}
              onSaved={() => setScreen({ id: 'day-book' })}
              onBack={() => setScreen({ id: 'gateway' })}
            />
          )}
          {screen.id === 'day-book' && session && (
            <DayBookScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
              onNewVoucher={() => setScreen({ id: 'voucher-entry', voucherTypeName: 'Payment' })}
            />
          )}
          {screen.id === 'trial-balance' && session && (
            <TrialBalanceScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
              onDrillDown={(ledgerId) => setScreen({ id: 'ledger-statement', ledgerId })}
            />
          )}
          {screen.id === 'profit-loss' && session && (
            <ProfitLossScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
              onDrillDown={(ledgerId) => setScreen({ id: 'ledger-statement', ledgerId })}
            />
          )}
          {screen.id === 'balance-sheet' && session && (
            <BalanceSheetScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
              onDrillDown={(ledgerId) => setScreen({ id: 'ledger-statement', ledgerId })}
            />
          )}
          {screen.id === 'ledger-statement' && session && (
            <LedgerStatementScreen
              session={session}
              initialLedgerId={screen.ledgerId}
              onBack={() => setScreen({ id: 'gateway' })}
            />
          )}
          {screen.id === 'stock-summary' && session && (
            <StockSummaryScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
            />
          )}
          {screen.id === 'outstanding' && session && (
            <OutstandingScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
            />
          )}
          {screen.id === 'tally-import' && session && (
            <TallyImportScreen
              session={session}
              onBack={() => setScreen({ id: 'gateway' })}
              onImportDone={() => setScreen({ id: 'trial-balance' })}
            />
          )}
          {screen.id === 'features' && session && (
            <FeaturesScreen
              features={session.features}
              onSaved={(features) => setSession({ ...session, features })}
              onBack={() => setScreen({ id: 'gateway' })}
            />
          )}
          {screen.id === 'configure' && (
            <ConfigureScreen onBack={() => setScreen(session ? { id: 'gateway' } : { id: 'select-company' })} />
          )}
          {screen.id === 'placeholder' && (
            <PlaceholderScreen
              title={screen.title}
              note={screen.note}
              onBack={() => setScreen({ id: 'gateway' })}
            />
          )}
        </main>

        <ButtonBar />
      </div>

      <footer className="status-bar">
        <span>{statusHint}</span>
        <span>
          {appInfo ? `v${appInfo.version} · ${appInfo.dataDir}` : 'LedgerDesk'}
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <KeyboardProvider>
      <Shell />
    </KeyboardProvider>
  );
}

export { App };
