# MASTER PROMPT: Build "LedgerDesk", a local-first accounting and inventory ERP (functional equivalent of Tally ERP 9)

> **Notes before use**
> - **Tally import:** Tally's native backup files (`.900`, `Tally.imp`, company folders) are proprietary and not reliably readable by third-party software. This prompt therefore specifies the dependable routes: Tally's XML export and its built-in XML/HTTP server on port 9000, plus Excel/CSV. It still asks for a best-effort reader for the native backup.
> - **Branding:** The prompt asks for a clone of the *functionality*, with its own name and no Tally code, assets or branding. That is fine for personal use.
> - **Usage tip:** If your AI tool has a small context window, give it Sections 0 to 3 plus Phase 1 first, then feed the remaining sections phase by phase.

---

## 0. ROLE AND GOAL
You are a senior full-stack engineer and accountant-developer. Build a complete desktop accounting, inventory, taxation and payroll application that reproduces the features and workflow of Tally ERP 9. It is for single-user personal use, runs 100% offline, and stores all data in a local database on my machine (no cloud, no telemetry, no accounts, no network calls except optional localhost). Do not copy Tally's code, assets or trademarks. Name the product "LedgerDesk" (configurable).

Deliver working, tested, runnable code, not pseudocode. Work phase by phase (Section 17), and after each phase show what runs and how to test it.

## 1. TECH STACK
- Shell: Electron (Windows primary, Linux/macOS also working), packaged with electron-builder.
- UI: React + TypeScript + Vite. No heavy UI kit; custom keyboard-first components.
- Database: SQLite via better-sqlite3 (WAL mode, foreign keys ON). One .db file per company in a user-chosen data directory. Optional encryption with SQLCipher.
- Migrations: versioned SQL migrations (e.g. Drizzle or hand-rolled).
- Reports/print: HTML-to-PDF through Electron's printToPDF; Excel export via exceljs; CSV; JSON.
- Testing: Vitest for the accounting engine (mandatory, high coverage), Playwright for key UI flows.
- Architecture: UI -> IPC -> service layer (pure TypeScript domain logic) -> repository layer -> SQLite. All accounting rules live in the service layer, never in the UI.

## 2. UX: REPLICATE THE TALLY WORKFLOW
- Keyboard-first interface: every action reachable without a mouse. Enter to move to the next field, Esc to go back or cancel, Ctrl+A to accept/save a form, Alt+key shortcuts shown in a right-side button bar (like Tally's F-key bar: F2 Date, F4 Contra, F5 Payment, F6 Receipt, F7 Journal, F8 Sales, F9 Purchase, F10 Other Vouchers, F11 Features, F12 Configure, Alt+C create master inline, Alt+D delete, Alt+E export, Ctrl+Enter, etc.).
- "Gateway of LedgerDesk" home screen: menu of Masters, Transactions, Utilities, Reports, Quit; top bar shows current company, period and date; left pane lists company info and current period.
- Auto-complete dropdown lists on every master field, with inline "Create new" (Alt+C) without leaving the voucher.
- Drill-down everywhere: Balance Sheet -> Group -> Ledger -> Monthly summary -> Day book -> Voucher -> edit. Esc goes back up the chain.
- Dense, low-distraction, high-contrast layout; light and dark themes; adjustable font size.
- Configuration screens (F11 Features, F12 Configure) to toggle options per company, per report and per voucher type.

## 3. COMPANY MANAGEMENT
- Create, alter, select, shut, delete and split companies. Multiple companies, one DB file each.
- Fields: name, mailing name, address, state, country, PIN, phone, email, website, financial year begin date, books begin date, base currency (symbol, decimals, word form), company PAN, GSTIN, CIN.
- Features toggles (F11): Accounting (maintain accounts only vs accounts-with-inventory, integrate accounts with inventory, multiple currencies, bill-wise details, cost centres, interest calculation, budgets and controls, payroll, GST, TDS, TCS, VAT/Excise optional, post-dated cheques, job costing, use debit/credit notes, invoice mode, optional vouchers, memorandum vouchers, reversing journals, multiple price levels, batches, expiry dates, manufacturing BOM, tracking numbers, order processing, purchase and sales orders, additional cost details, actual vs billed quantity, rejection in/out, use zero-valued transactions).
- Company security: password, user roles (Owner, Data Entry, Auditor/read-only, custom), per-user permissions on voucher types, reports, alter/delete, back-dated entries, plus a TallyVault equivalent (encrypted DB).
- Split company data / carry forward to a new financial year with closing balances, bill-wise outstanding and stock closing carried to opening.
- Data integrity tools: verify DB, repair, rewrite/re-index, audit of orphan records.

## 4. MASTERS

### 4.1 Accounts masters
- **Groups:** seed all 28 default Tally groups (Primary: Branch/Divisions, Capital Account, Current Assets, Current Liabilities, Direct Expenses, Direct Incomes, Fixed Assets, Indirect Expenses, Indirect Incomes, Investments, Loans (Liability), Misc. Expenses (Asset), Purchase Accounts, Sales Accounts, Suspense A/c; Sub-groups: Bank Accounts, Bank OD A/c, Cash-in-Hand, Deposits (Asset), Duties and Taxes, Loans and Advances (Asset), Provisions, Reserves and Surplus, Retained Earnings, Secured Loans, Stock-in-Hand, Sundry Creditors, Sundry Debtors, Unsecured Loans). User-defined groups with nature (Assets/Liabilities/Income/Expense), "behaves like sub-ledger", "net debit/credit balances for reporting", "used for calculation (purchase/sales)".
- **Ledgers:** name, alias, under group, opening balance (Dr/Cr), maintain bill-by-bill, default credit period, inventory values affected, cost centres applicable, interest calculation, mailing details (name, address, state, country, PIN), contact details, bank details (account no., IFSC, SWIFT, bank name, branch), PAN, GST registration type (Regular/Composition/Unregistered/Consumer/Overseas/SEZ/Deemed export), GSTIN, tax details (TDS nature of payment, deductee type, TCS), rounding method, ledger type for duties and taxes (GST/TDS/TCS/Others), tax rate, percentage of calculation, Type of Ledger (Discount/Invoice Rounding), behaviour in voucher class.
- **Voucher types:** all predefined types (Contra, Payment, Receipt, Journal, Sales, Purchase, Credit Note, Debit Note, Memorandum, Reversing Journal, Rejections In/Out, Delivery Note, Receipt Note, Purchase Order, Sales Order, Stock Journal, Physical Stock, Material In, Material Out, Job Work In/Out Order, Payroll, Attendance) plus user-defined types under any parent. Each type has: numbering method (automatic / automatic with manual override / manual / none), prefix/suffix, restart numbering (yearly/monthly/daily), prevent duplicates, use effective dates, allow zero-valued entries, optional by default, narration per entry or per ledger, print after save, default title/jurisdiction/declaration/bank, voucher classes (e.g. "Local Sales 18%") with auto-posted ledgers and percentages.
- **Currencies:** symbol, formal name, decimal places, rate-of-exchange table by date (standard, selling, buying), forex gain/loss auto-postings.
- **Cost centres/categories** and cost categories (allocate by percentage, amount, or per voucher), cost centre classes.
- **Budgets:** by group/ledger/cost centre, per period; Budget Variance report; budget controls (warn/block).
- **Scenarios:** actual / reversing journal / optional vouchers combined views.

### 4.2 Inventory masters
- Stock groups (with nested hierarchy), stock categories, units (simple + compound, e.g. 1 Box = 12 Nos; decimal places), godowns/locations (hierarchy, "Main Location").
- Stock items: name, alias, part no., under group/category, units, alternate units with conversion, opening balance (quantity, rate, value; batch-wise, godown-wise), costing method (Avg Cost, FIFO, LIFO, Last Purchase Cost, Std Cost, Zero Cost), market valuation method, standard cost and standard selling price lists with effective dates, batch maintenance (batch name, manufacturing date, expiry date), reorder level, minimum order quantity, HSN/SAC, GST rate details (taxable/exempt/nil rated/non-GST, rate, cess, IGST/CGST/SGST), bill of materials (components, by-products, co-products, scrap), description, remarks, "set/alter" GST details with applicable-from dates, tracking numbers.
- Price lists with price levels and discounts by quantity slab.

### 4.3 Payroll masters
See Section 11.

### 4.4 Statutory masters
GST, TDS, TCS, VAT: see Section 10.

## 5. TRANSACTIONS (VOUCHER ENTRY)
Implement all with the same screens and behaviour as Tally:
- **Accounting vouchers:** Contra, Payment, Receipt, Journal (single-entry and double-entry modes), Sales, Purchase, Credit Note, Debit Note, with bill allocation (New Ref / Agst Ref / Advance / On Account) and due dates, cost centre allocation, narration, cheque details (cheque number, date, bank, post-dated, cheque printing templates), bank allocations (instrument no., date, bank name, transaction type: cheque/DD/ECS/NEFT/RTGS/UPI), TDS/TCS deduction, forex.
- **Invoice mode and voucher mode** for Sales/Purchase: party details, buyer/consignee, GST place of supply, item rows (item, godown, batch, quantity, rate, per, discount %, amount), additional ledgers (freight, discount, GST, round-off) with auto-calc, order/delivery note/receipt note tracking (order no., dispatch details, vehicle, e-way bill), terms of delivery, declaration, bank details, multiple price levels, "actual vs billed" quantity.
- **Inventory vouchers:** Stock Journal (transfer between godowns, manufacturing journal with BOM auto-fill), Physical Stock, Delivery Note, Receipt Note, Rejection In/Out, Purchase Order, Sales Order, Job Work orders, Material In/Out.
- **Memorandum, Optional, and Reversing Journal** vouchers with proper effect on reports.
- **Post-dated vouchers** management and conversion to regular.
- **Voucher operations:** create, alter, duplicate, cancel (keep voucher with zero value, flagged), delete, insert voucher in between (Alt+I), voucher date change, voucher number re-sequencing, "Day Book" editing, voucher search by number/narration/amount/party/date, auto-narration templates.
- **Order management:** outstanding orders, order-vs-delivery tracking, pending orders, cancel/close orders.
- **Voucher multi-select** with bulk actions (cancel, delete, mark optional).
- **Back-dating/lock date control** and edit logs (who/when/what) on every voucher.
- **Double-entry integrity:** debits must equal credits, enforced in the service layer AND by DB constraints/triggers; amounts stored as integers (minor units) or decimal strings. NEVER use floats for money.

## 6. ACCOUNTING ENGINE REQUIREMENTS
- Immutable general-ledger entry table derived from vouchers; ledger balances, group balances, trial balance computed by queries/materialised summaries kept consistent in transactions.
- Opening balance logic, financial year rollover, closing stock integrated into P&L and Balance Sheet.
- Bill-wise (receivable/payable) engine: reference creation, settlement, advance, partial settlement, ageing buckets (configurable days), overdue by due date and credit period.
- Stock valuation engine implementing Avg Cost, FIFO, LIFO, Last Purchase, Standard Cost; handle negative stock option, backdated entries (recalculate cost downstream), batch-wise and godown-wise valuation, manufacturing cost roll-up, closing stock value in reports with market-value comparison.
- Interest calculation: simple/compound, per ledger, per bill or on balances, with rate by period, grace days, and Interest report with voucher generation (journal).
- Forex: transaction-date rate, revaluation at period end, unrealised and realised gain/loss vouchers.
- Rounding, tax inclusive/exclusive pricing, discount (trade/cash) handling.
- All calculations covered by unit tests with fixtures (sample company with at least 200 vouchers) and a reconciliation test: Trial Balance debit == credit; Balance Sheet balances; sum of group balances == sum of ledger balances.

## 7. REPORTS
All drillable, period-selectable, exportable to PDF/Excel/CSV, printable, with configurable columns (F12).

### 7.1 Financial statements
Balance Sheet (horizontal and vertical), Profit & Loss A/c (horizontal and vertical, with gross profit), Trial Balance (group-wise, ledger-wise, with opening/transactions/closing columns), Cash Flow, Funds Flow, Ratio Analysis (current ratio, quick ratio, debt/equity, inventory turnover, receivable turnover, gross/net margin, return on investment, etc.), Working Capital, comparative period analysis, columnar reports (period-wise, multi-company, scenario).

### 7.2 Books and registers
Day Book, Cash/Bank Book, Ledger Vouchers, Group Summary, Group Vouchers, Ledger Monthly Summary, Sales Register, Purchase Register, Journal Register, Payment/Receipt Register, Debit/Credit Note Register, Contra register, Voucher register for any voucher type, Cost Centre Summary/Breakup, Statistics, Exception reports (negative cash/stock, overdrawn ledgers, memorandum, optional, post-dated, order-pending).

### 7.3 Outstanding and bill reports
Bills Receivable, Bills Payable, Ageing Analysis (by party/bill), Party Outstanding, Overdue, Interest Calculation, Ledger Outstanding, Payment Performance, Collection Reminder letters, Bank Reconciliation (reconcile by bank date, BRS statement, auto-match to imported bank statement CSV, unreconciled report), Cheque register and printing, Post-dated cheque summary.

### 7.4 Inventory reports
Stock Summary (by group/category/godown/batch, quantity+rate+value), Stock Item Monthly Summary, Stock Item Voucher/Movement Analysis, Stock Query, Godown Summary, Batch Summary (expiry ageing), Reorder Status, Ageing Analysis of stock, Stock Valuation comparisons, Sales/Purchase Order outstanding, Job Work reports, Negative stock report, Movement analysis (by ledger/group/category), Profitability (item/ledger/group), Purchase Bills pending, Sales Bills pending, Stock transfer register, Manufacturing/BOM reports, Price list report.

### 7.5 Statutory, payroll, budget and cost reports
Statutory reports: Section 10. Payroll reports: Section 11. Budget and cost reports: variance, cost centre breakup.

### 7.6 Audit and analysis tools
Audit Trail log, Edit log (before/after JSON per voucher), Day-end/year-end checks, Verified vouchers list, Pending verification, Data Analysis (cash/funds flow, ratio), Voucher Verification tool, Pending vouchers.

## 8. PRINTING AND DOCUMENTS
Invoice, quotation, challan, receipt, payment advice, cheque, ledger statements, balance confirmation letter, reminder letter, delivery note, purchase order, pay slip, barcodes/QR on invoices, label printing; template designer (HTML/CSS with placeholders), company logo, signature, multiple copies (original/duplicate/triplicate), A4/A5/thermal 80mm, PDF email via mailto (no SMTP required), WhatsApp share by file export only.

## 9. TECHNICAL EXTRAS (Tally "Utilities")
- Import/Export of data: Excel, CSV, JSON, XML for masters, vouchers and reports; Excel templates for bulk voucher import with validation and preview.
- Backup and restore (Section 13). Data migration/split/merge.
- Print configuration, calculator, date/period selector, "Go To" (Alt+G) jump-to-any-report/master, search bar Ctrl+K.
- Change-log, user activity, session lock after idle, multi-language/Unicode (including Malayalam, Hindi), Indian number format (lakhs/crores) as option, date formats DD-MM-YYYY, number-to-words in Indian and international systems.
- Optional local REST/XML endpoint on localhost only (off by default) mimicking Tally's port 9000 for my own scripts.

## 10. STATUTORY MODULES (INDIA)

### GST
- Registration types, GSTIN validation (checksum), state codes, place of supply logic, intra-state (CGST+SGST/UTGST) vs inter-state (IGST), reverse charge (RCM) with self-invoice generation, composition scheme, SEZ, exports with/without payment, deemed export, nil/exempt/non-GST supplies, input tax credit eligibility and ineligible ITC (Section 17(5)), cess, advance receipt tax liability, GST on advances/adjustments, HSN/SAC summary, tax rate effective-date history.
- Reports: GSTR-1 (B2B, B2CL, B2CS, CDNR, CDNUR, Exports, HSN, Docs issued, Nil/exempt) with JSON export in GST portal schema, GSTR-3B summary and computation, GSTR-2A/2B reconciliation (import portal JSON/Excel and match with purchase books: matched, mismatched, missing in books, missing in portal), GST ledger/tax liability, ITC register, GST payment challan voucher, e-Invoice (IRN payload JSON generation + QR placement; actual submission is manual/out-of-scope), e-Way Bill JSON for bulk upload, GST annual return working sheets (GSTR-9 data).

### TDS and TCS
Nature-of-payment master with rates (individual/company, with/without PAN), thresholds (single/aggregate), deduction at source on voucher entry, TDS payable ledgers, challan payment voucher, Form 26Q/24Q data export (FVU-compatible text where feasible), Form 16/16A generation, TDS outstanding, deductee-wise reports, lower-deduction certificates, TCS on sale of goods; late-payment interest calculation.

### Other
Professional Tax, PF/ESI/NPS in payroll, VAT/Excise/Service Tax as optional legacy modules for historical data, Income-tax depreciation schedule (as per IT Act with WDV blocks) and Companies Act depreciation, fixed asset register with additions/disposals.

## 11. PAYROLL
- Masters: employee groups/categories, employees (personal, joining/leaving dates, bank details, PAN, Aadhaar, UAN, ESI no.), pay heads (earnings, deductions, employer contributions, reimbursements, loans/advances, gratuity) with calculation types (flat rate, on attendance, as computed value on specified formula, on production), units (attendance/production types), salary details with effective dates.
- Transactions: payroll vouchers (Payroll voucher, Attendance voucher), pay slips, payroll statements.
- Statutory: PF/ESI/PT computation, challans and returns data (ECR text file for PF), gratuity and bonus, loan recovery, payment advice and bank transfer file (CSV), department/cost-centre wise payroll, final settlement.

## 12. SECURITY AND AUDIT
Local user accounts with Argon2/bcrypt passwords, roles, permission matrix, optional DB encryption, session timeout, tamper-evident audit log (hash-chained), lock vouchers up to a date, prevent deletion of verified vouchers, read-only auditor mode.

## 13. BACKUP, RESTORE AND IMPORT FROM TALLY (CRITICAL)

### 13.1 Native backup/restore
- One-click and scheduled local backups (daily/weekly/on close) to a chosen folder: compressed (zip) copy of the SQLite DB + manifest (app version, company, checksum). Retention policy (keep last N). Restore with preview, integrity check, version migration, and a pre-restore safety snapshot. Also export a human-readable full dump (JSON + CSV).

### 13.2 TALLY IMPORT (must be implemented as a full module: "Import from Tally")
Build an import wizard with these routes, in this order of priority:

1. **Tally XML export import** (primary, most reliable): accept XML files exported from Tally ERP 9 (Gateway -> Export -> Masters / Vouchers / Data -> XML) and from "Export Data" in the Day Book. Parse TALLYMESSAGE nodes for: GROUP, LEDGER (with OPENINGBALANCE, bill allocations, GST/TDS details, addresses, bank details), STOCKGROUP, STOCKCATEGORY, STOCKITEM (with units, GST history, batch, BOM), UNIT, GODOWN, COSTCENTRE, COSTCATEGORY, CURRENCY, VOUCHERTYPE, EMPLOYEE, PAYHEAD, ATTENDANCETYPE, VOUCHER (all types, with ALLLEDGERENTRIES.LIST / LEDGERENTRIES.LIST, INVENTORYENTRIES.LIST, ALLINVENTORYENTRIES.LIST, BILLALLOCATIONS.LIST, BATCHALLOCATIONS.LIST, ACCOUNTINGALLOCATIONS.LIST, CATEGORYALLOCATIONS, bank allocations, GST rate details, e-way details, narration, GUID, ALTERID, REMOTEID). Handle encoding quirks (UTF-16/UTF-8 with BOM, invalid XML characters like `&#4;` entities, &-escaped text), very large files (streaming SAX parser, batched inserts inside transactions), and both single-object and list nodes.
2. **Live import via Tally's built-in XML server:** if Tally ERP 9 is open with "Tally.ERP 9 acts as: Server/Both" on a configurable localhost port (default 9000), connect over HTTP, send XML export requests (Collection of Ledgers/Groups/Stock Items/Vouchers by date range, Report 'List of Companies') and import the results. Show a progress bar, allow pause/retry, and chunk voucher requests by month.
3. **Excel/CSV import** from Tally's own exports (Trial Balance, Ledger list, Stock Summary, Day Book) with column mapping UI saved as reusable mapping profiles.
4. **Native Tally data/backup folder (best effort):** let me pick a Tally Data directory or a Tally backup (.900 files, Tally.imp, company number folder). Implement a detector that identifies the file type and company name where possible. IMPORTANT: since these formats are proprietary and can be encrypted/version-specific, do NOT fabricate parsing. If the files cannot be parsed, show clear step-by-step instructions to open the backup in Tally ERP 9 and export XML (or enable the XML server) and then run route 1 or 2. Structure the code as a pluggable `TallyNativeReader` interface so a reader can be added later.

**Import wizard behaviour:**
- Steps: select source -> detect company/period/version -> choose what to import (masters, opening balances, vouchers, inventory, payroll, GST data) -> mapping preview -> dry run -> import -> reconciliation report.
- Mapping rules: Tally groups -> my groups (merge duplicates by name, case-insensitive; preserve hierarchy), voucher type names, units, GST registration types, state names to codes, Dr/Cr sign conventions (Tally XML uses negative amounts for debit in some nodes; handle correctly and unit-test against sample files), date format YYYYMMDD -> ISO date, billing references, stock valuation metadata.
- Idempotency and merge: use Tally GUID/REMOTEID as external ID; re-running updates, not duplicates. Options: create new company vs merge into existing, skip existing, overwrite.
- Validation after import: trial balance totals match source, ledger-wise closing balance comparison table (source vs imported, highlight differences), stock quantity/value comparison, voucher count by type, list of skipped/failed records with reasons, downloadable import log (CSV).
- Error handling: partial failure rolls back the batch, never corrupts existing data; auto-backup before import.
- Provide sample Tally XML fixtures (masters + vouchers incl. GST sales invoice with inventory, receipt with bill allocation, journal, stock journal) and automated tests for the importer.
- Also provide EXPORT back to Tally-compatible XML (masters and vouchers) so data can round-trip.

## 14. DATABASE DESIGN (SQLite)
Design a normalized schema with at least these tables (add columns, indexes and constraints as needed):

`company`, `company_features`, `financial_year`, `user`, `role`, `permission`, `audit_log`, `edit_log`, `group`, `ledger`, `ledger_bank_details`, `ledger_gst_details`, `ledger_tds_details`, `currency`, `exchange_rate`, `cost_category`, `cost_centre`, `budget`, `budget_line`, `voucher_type`, `voucher_class`, `voucher`, `voucher_ledger_entry`, `voucher_inventory_entry`, `voucher_bill_allocation`, `voucher_cost_allocation`, `voucher_bank_allocation`, `voucher_gst_summary`, `voucher_tds_entry`, `unit`, `stock_group`, `stock_category`, `godown`, `stock_item`, `stock_item_gst_history`, `stock_item_bom`, `price_list`, `price_list_item`, `batch`, `stock_ledger` (movements), `order`, `order_line`, `bill_ref` (receivable/payable), `interest_rule`, `fixed_asset`, `depreciation_entry`, `employee`, `pay_head`, `employee_salary_structure`, `attendance`, `payroll_run`, `payroll_line`, `tally_import_job`, `tally_import_map` (external_id -> local_id), `report_config`, `backup_log`, `settings`.

Requirements: integer minor-unit money (or decimal strings), CHECK constraints, foreign keys, indexes on (date, ledger_id), (voucher_type_id, number), (stock_item_id, date), triggers enforcing debit == credit per voucher, soft-delete with audit, schema version table, and a documented ER diagram (Mermaid) in `/docs`.

## 15. NON-FUNCTIONAL REQUIREMENTS
- **Performance:** open a company with 500,000 vouchers; Trial Balance in under 2 s; voucher save under 100 ms; virtualized tables; background workers for imports and heavy reports.
- **Reliability:** all multi-row writes in transactions; crash-safe; auto-backup on exit; DB integrity check on open.
- **Offline-only:** no outbound network; CSP locked; no auto-update; Electron hardened (contextIsolation on, nodeIntegration off, sandboxed preload, IPC input validation with Zod).
- **Accessibility:** keyboard navigation, screen-reader labels, scalable fonts.
- **i18n:** English default, string tables for adding Malayalam/Hindi.
- **Logging:** local rotating log files; in-app error viewer.

## 16. PROJECT STRUCTURE AND DELIVERABLES
- `/apps/desktop` (electron main, preload, renderer)
- `/packages/core` (accounting, inventory, GST, TDS, payroll, interest, valuation engines, pure TS)
- `/packages/db` (schema, migrations, repositories)
- `/packages/tally-import` (XML parser, live connector, mappers, reconcilers, fixtures)
- `/packages/reports` (report definitions + renderers)
- `/docs` (architecture, schema ER, user manual, keyboard shortcut map, Tally-to-LedgerDesk feature mapping table, import guide)
- `/tests`

Also deliver: seed data (default groups, voucher types, GST rates, TDS natures, states), sample demo company, README with run/build/package instructions, and a feature parity checklist (Tally feature -> implemented / partial / not applicable) kept up to date.

## 17. BUILD PHASES (stop after each and demonstrate)
1. **Foundation:** repo, Electron+React shell, SQLite, migrations, company create/select, gateway screen, keyboard framework.
2. **Accounting masters + vouchers** (Payment, Receipt, Contra, Journal, Sales, Purchase, Notes) + ledger/day book/trial balance/P&L/balance sheet + tests.
3. **Bill-wise outstanding,** ageing, cost centres, budgets, bank reconciliation, cheque printing, interest.
4. **Inventory:** stock masters, godowns, batches, valuation methods, inventory vouchers, orders, BOM/manufacturing, inventory reports, accounts-inventory integration.
5. **GST (full),** e-invoice/e-way JSON, GSTR-1/3B/2B reconciliation, TDS/TCS, fixed assets/depreciation.
6. **Payroll module** and statutory exports.
7. **Tally import module** (Section 13.2) with fixtures, reconciliation and round-trip export.
8. **Backup/restore,** security, audit trail, printing templates, performance tuning, packaging into an installer, final parity checklist and user manual.

## 18. QUALITY BAR AND RULES FOR YOU
- Ask me at most one clarifying question if something blocks you; otherwise state assumptions and proceed.
- Never use floating-point for currency. Never silently drop data. Never fabricate unknown proprietary file formats.
- Every accounting feature must have unit tests; every report must be verified against the trial-balance invariants.
- Write clean, typed, documented code; keep the engine pure and UI-independent.
- At the end of each phase, output: what was built, how to run it, test results, known gaps, next phase plan.

**Begin with Phase 1 now.**
