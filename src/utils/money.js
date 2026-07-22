/**
 * Purchase bill math matching distributor software (e.g. VarthagamSoft / Monicka):
 *
 *   Goods Value = Σ Amount (qty×rate when Amount empty)
 *   C.Disc Amt  = floor(Goods × C.Disc%) / 100     → 5141.66×4 → 205.66
 *   Taxable     = Goods − C.Disc (− line disc only if Amount is still gross)
 *   GST         = Taxable × GST% by slab             → 4936×5% → 246.80
 *   Net         = round(Taxable + GST) to ₹          → 5183.00
 */

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** VarthagamSoft-style money: truncate toward zero at 2 decimals via floor on paise of (value×%). */
export function cashDiscAmount(goodsValue, cashDiscPercent) {
  const goods = Number(goodsValue) || 0;
  const pct = Math.min(100, Math.max(0, Number(cashDiscPercent) || 0));
  if (goods <= 0 || pct <= 0) return 0;
  // 5141.66 * 4 = 20566.64 → floor → 20566 → /100 = 205.66
  return Math.floor(goods * pct + 1e-6) / 100;
}

/** Line amount used for Goods Value (prefer OCR Amount). */
export function lineGoodsAmount(row) {
  const qty = Number(row.qty) || 0;
  const rate = Number(row.rate) || 0;
  const amount = Number(row.value);
  if (amount > 0) return round2(amount);
  return round2(qty * rate);
}

/** Per-line helpers for tax column display. */
export function calcPurchaseLine(row, cashShare = 0) {
  const qty = Number(row.qty) || 0;
  const rate = Number(row.rate) || 0;
  const discPercent = Math.min(100, Math.max(0, Number(row.discount) || 0));
  const gstPercent = Math.max(0, Number(row.tax) || 0);
  const gross = lineGoodsAmount(row);
  // Line Disc% only if Amount still looks like full qty×rate (disc not already in Amount)
  const qtyRate = round2(qty * rate);
  const discAlreadyInAmount = qtyRate > 0 && Math.abs(qtyRate - gross) > 1.5;
  const discAmt = discAlreadyInAmount
    ? 0
    : round2((qtyRate * discPercent) / 100);
  const taxable = round2(Math.max(0, gross - discAmt - (Number(cashShare) || 0)));
  const gstAmt = round2((taxable * gstPercent) / 100);
  const net = round2(taxable + gstAmt);

  return {
    qty,
    rate,
    discPercent: discAlreadyInAmount ? 0 : discPercent,
    gstPercent,
    gross,
    discAmt,
    taxable,
    gstAmt,
    net,
  };
}

/** Bill footer totals — matches Monicka / VarthagamSoft invoice. */
export function calcPurchaseSummary(rows, cashDiscPercent = 0) {
  const list = rows || [];
  const goodsValue = round2(list.reduce((s, row) => s + lineGoodsAmount(row), 0));
  const cashPct = Math.min(100, Math.max(0, Number(cashDiscPercent) || 0));
  const cashDiscAmt = cashDiscAmount(goodsValue, cashPct);

  // Line disc only when Amount is gross (qty×rate); otherwise Amount already net of line disc
  let lineDisc = 0;
  const prelim = list.map(row => {
    const qty = Number(row.qty) || 0;
    const rate = Number(row.rate) || 0;
    const qtyRate = round2(qty * rate);
    const gross = lineGoodsAmount(row);
    const discPercent = Math.min(100, Math.max(0, Number(row.discount) || 0));
    const discAlreadyInAmount = qtyRate > 0 && Math.abs(qtyRate - gross) > 1.5;
    const discAmt = discAlreadyInAmount ? 0 : round2((qtyRate * discPercent) / 100);
    lineDisc += discAmt;
    return { row, gross, discAmt, gstPercent: Math.max(0, Number(row.tax) || 0) };
  });
  lineDisc = round2(lineDisc);

  const totalDisc = round2(lineDisc + cashDiscAmt);
  const taxableBase = round2(Math.max(0, goodsValue - totalDisc));

  // Allocate cash+line disc by line goods weight, then GST by slab (like invoice tax table)
  const lines = prelim.map(p => {
    const share = goodsValue > 0 ? p.gross / goodsValue : 0;
    const cashShare = cashDiscAmt * share;
    const taxableFinal = Math.max(0, p.gross - p.discAmt - cashShare);
    const gstAmt = (taxableFinal * p.gstPercent) / 100;
    return {
      ...calcPurchaseLine(p.row, cashShare),
      cashShare: round2(cashShare),
      taxableFinal: round2(taxableFinal),
      gstAmt: round2(gstAmt),
      net: round2(taxableFinal + gstAmt),
      gross: p.gross,
      discAmt: p.discAmt,
      gstPercent: p.gstPercent,
    };
  });

  // Prefer slab total on taxable base when all lines share one GST% (exact 246.80 on 4936)
  const rates = [...new Set(lines.map(l => l.gstPercent).filter(r => r > 0))];
  let totalGst;
  if (rates.length === 1) {
    totalGst = round2((taxableBase * rates[0]) / 100);
  } else if (rates.length === 0) {
    totalGst = 0;
  } else {
    // Mixed slabs: sum per-line then round (invoice groups by rate)
    const byRate = {};
    for (const l of lines) {
      const r = l.gstPercent || 0;
      byRate[r] = (byRate[r] || 0) + (l.taxableFinal || 0);
    }
    totalGst = round2(
      Object.entries(byRate).reduce(
        (s, [rate, taxable]) => s + (Number(taxable) * Number(rate)) / 100,
        0
      )
    );
  }

  const rawNet = round2(taxableBase + totalGst);
  const netAmount = Math.round(rawNet);
  const roundOff = round2(netAmount - rawNet);

  return {
    lines,
    goodsValue,
    lineDisc,
    cashDiscPercent: cashPct,
    cashDiscAmt,
    totalDisc,
    taxableBase,
    totalGst,
    rawNet,
    roundOff,
    netAmount,
  };
}

/** Outstanding due for a customer from sale invoices. */
export function getCustomerDue(invoices, customer) {
  if (!customer) return 0;
  const id = customer.id != null ? Number(customer.id) : null;
  const name = String(customer.name || '').trim().toLowerCase();

  return round2(
    (invoices || [])
      .filter(inv => !inv.type || inv.type === 'sale')
      .filter(inv => {
        if (id != null && inv.customerId != null && Number(inv.customerId) === id) return true;
        return name && String(inv.customer || '').trim().toLowerCase() === name;
      })
      .reduce((sum, inv) => {
        const bill = Number(inv.amount) || 0;
        const paid = inv.amountPaid != null
          ? Number(inv.amountPaid)
          : (String(inv.status || '').toLowerCase() === 'paid' ? bill : 0);
        return sum + Math.max(0, bill - paid);
      }, 0)
  );
}
