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

/** Generate invoice number (full timestamp keeps chronological uniqueness) */
export const genInvoiceNo = (prefix = 'INV') =>
  `${prefix}-${Date.now()}`;
