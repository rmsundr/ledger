import type { Db } from '@ledgerdesk/db';

export interface StockSummaryRow {
  itemId: string;
  itemName: string;
  groupName: string;
  unitSymbol: string;
  openingQty: number;
  openingRate: number;
  openingVal: number;
  inwardQty: number;
  inwardVal: number;
  outwardQty: number;
  outwardVal: number;
  closingQty: number;
  closingRate: number;
  closingVal: number;
}

export interface StockSummaryReport {
  rows: StockSummaryRow[];
  totalOpeningValue: number;
  totalInwardValue: number;
  totalOutwardValue: number;
  totalClosingValue: number;
}

export function generateStockSummary(db: Db, companyId: string, asOfDate?: string): StockSummaryReport {
  const dateFilter = asOfDate ? `AND sl.date <= ?` : '';
  const params = asOfDate ? [companyId, asOfDate] : [companyId];

  const sql = `
    SELECT
      si.id AS item_id,
      si.name AS item_name,
      COALESCE(sg.name, 'Primary') AS group_name,
      u.symbol AS unit_symbol,
      si.opening_quantity,
      si.opening_rate,
      si.opening_value,
      COALESCE(SUM(sl.inward_qty), 0) AS inward_qty,
      COALESCE(SUM(sl.inward_qty * sl.rate), 0) AS inward_val,
      COALESCE(SUM(sl.outward_qty), 0) AS outward_qty,
      COALESCE(SUM(sl.outward_qty * sl.rate), 0) AS outward_val
    FROM stock_item si
    JOIN unit u ON si.unit_id = u.id
    LEFT JOIN stock_group sg ON si.group_id = sg.id
    LEFT JOIN stock_ledger sl ON sl.stock_item_id = si.id ${dateFilter}
    WHERE si.company_id = ? AND si.deleted_at IS NULL
    GROUP BY si.id
    ORDER BY sg.name, si.name
  `;

  const rows = db.prepare(sql).all(...params) as {
    item_id: string;
    item_name: string;
    group_name: string;
    unit_symbol: string;
    opening_quantity: number;
    opening_rate: number;
    opening_value: number;
    inward_qty: number;
    inward_val: number;
    outward_qty: number;
    outward_val: number;
  }[];

  let totalOpeningValue = 0;
  let totalInwardValue = 0;
  let totalOutwardValue = 0;
  let totalClosingValue = 0;

  const resultRows: StockSummaryRow[] = rows.map((r) => {
    const closingQty = r.opening_quantity + r.inward_qty - r.outward_qty;
    const closingVal = r.opening_value + r.inward_val - r.outward_val;
    const closingRate = closingQty > 0 ? Math.round(closingVal / closingQty) : r.opening_rate;

    totalOpeningValue += r.opening_value;
    totalInwardValue += r.inward_val;
    totalOutwardValue += r.outward_val;
    totalClosingValue += closingVal;

    return {
      itemId: r.item_id,
      itemName: r.item_name,
      groupName: r.group_name,
      unitSymbol: r.unit_symbol,
      openingQty: r.opening_quantity,
      openingRate: r.opening_rate,
      openingVal: r.opening_value,
      inwardQty: r.inward_qty,
      inwardVal: r.inward_val,
      outwardQty: r.outward_qty,
      outwardVal: r.outward_val,
      closingQty,
      closingRate,
      closingVal,
    };
  });

  return {
    rows: resultRows,
    totalOpeningValue,
    totalInwardValue,
    totalOutwardValue,
    totalClosingValue,
  };
}
