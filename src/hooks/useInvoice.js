import { useMemo } from 'react';

/**
 * Calculates invoice totals from cart items.
 * Each item: { product, qty, rate, cgst, sgst }
 *
 * TAX TEMPORARILY DISABLED — grandTotal = subtotal only.
 * To re-enable: remove the three override lines marked with // TAX DISABLED
 */
export function useInvoice(cartItems) {
  return useMemo(() => {
    const rows = cartItems.map(item => {
      const qty  = Number(item.qty)  || 0;
      const rate = Number(item.rate) || 0;

      const lineAmt = qty * rate;
      const cgstAmt = 0;   // TAX DISABLED
      const sgstAmt = 0;   // TAX DISABLED
      const total   = lineAmt; // TAX DISABLED — was: lineAmt + cgstAmt + sgstAmt

      return { ...item, lineAmt, cgstAmt, sgstAmt, total };
    });

    const subtotal   = rows.reduce((s, r) => s + r.lineAmt, 0);
    const totalCgst  = 0; // TAX DISABLED
    const totalSgst  = 0; // TAX DISABLED
    const totalTax   = 0; // TAX DISABLED
    const grandTotal = subtotal;

    return { rows, subtotal, totalCgst, totalSgst, totalTax, grandTotal };
  }, [cartItems]);
}

/** Format INR currency */
export const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

/**
 * Document number format:
 *   Purchase → PO2607001  (PO + YY + MM + continuous 001, 002…)
 *   Sale     → SL2607001  (SL + YY + MM + continuous 001, 002…)
 * Sequence resets each calendar month for that prefix.
 */
export async function nextDocumentNo(type = 'sale') {
  const res = await fetch('/api/document-numbers/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate document number');
  return data.id;
}

/** @deprecated Prefer nextDocumentNo('sale'|'purchase') for sequential IDs */
export const genInvoiceNo = (prefix = 'INV') => {
  const map = { PUR: 'PO', PO: 'PO', INV: 'SL', SLS: 'SL', SL: 'SL' };
  const p = map[String(prefix).toUpperCase()] || String(prefix).toUpperCase().slice(0, 2);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  // Temporary local placeholder until async nextDocumentNo resolves
  return `${p}${yy}${mm}…`;
};
