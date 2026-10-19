export interface DefaultVoucherTypeDef {
  name: string;
  parentName?: string;
}

export const DEFAULT_VOUCHER_TYPES: DefaultVoucherTypeDef[] = [
  { name: 'Contra' },
  { name: 'Payment' },
  { name: 'Receipt' },
  { name: 'Journal' },
  { name: 'Sales' },
  { name: 'Purchase' },
  { name: 'Credit Note' },
  { name: 'Debit Note' },
  { name: 'Memorandum' },
  { name: 'Reversing Journal' },
  { name: 'Rejections In' },
  { name: 'Rejections Out' },
  { name: 'Delivery Note' },
  { name: 'Receipt Note' },
  { name: 'Purchase Order' },
  { name: 'Sales Order' },
  { name: 'Stock Journal' },
  { name: 'Physical Stock' },
  { name: 'Material In' },
  { name: 'Material Out' },
  { name: 'Job Work In Order' },
  { name: 'Job Work Out Order' },
  { name: 'Payroll' },
  { name: 'Attendance' },
];
