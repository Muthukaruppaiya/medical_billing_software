import { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Printer, CheckCircle, ReceiptText } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { formatExpiry } from '../../utils/expiry';

export default function PrintBillModal({ invoice, onClose, onNewBill }) {
  const { state } = useApp();
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Bill_${invoice.id}`,
  });

  const company = state.company || {};
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  const subtotal = items.reduce((s, item) => {
    const gross = item.grossAmt ?? (Number(item.qty) * Number(item.rate));
    return s + gross;
  }, 0);
  const lineDiscountTotal = items.reduce((s, item) => {
    if (item.discAmt != null) return s + Number(item.discAmt);
    const gross = item.grossAmt ?? (Number(item.qty) * Number(item.rate));
    const disc = Math.min(100, Math.max(0, Number(item.discPercent) || 0));
    return s + (gross * disc) / 100;
  }, 0);
  const discountTotal = Number(invoice.discount) > 0 ? Number(invoice.discount) : lineDiscountTotal;
  const grandTotal = invoice.amount ?? Math.max(0, subtotal - discountTotal);

  const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[95vh] overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-500 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Bill Saved Successfully!</h2>
              <p className="text-emerald-100 text-xs mt-0.5">Invoice {invoice.id} · {invoice.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100/80 p-4">
          <div ref={printRef} className="bg-white p-8 shadow-md mx-auto rounded-lg" style={{ maxWidth: 820 }}>

            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 9mm; }
                body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                .print-bill { width: 100% !important; max-width: none !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
              }
            `}</style>

            <div className="print-bill">
            <div className="flex items-start justify-between gap-6 border-b-[3px] border-emerald-700 pb-4 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 mb-1">
                  Tax Invoice / Cash Memo
                </p>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight uppercase">
                  {company.name || 'Medicare Pharmacy'}
                </h1>
                {company.address && <p className="text-xs text-slate-600 mt-1 max-w-md whitespace-pre-line">{company.address}</p>}
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-xs text-slate-600">
                  {company.phone && <span>Phone: {company.phone}</span>}
                  {company.email && <span>Email: {company.email}</span>}
                </div>
                <div className="flex flex-wrap gap-x-5 mt-1 text-xs text-slate-600">
                  {company.gstin && <span><b>GSTIN:</b> {company.gstin}</span>}
                  {company.drugLicense && <span><b>DL No:</b> {company.drugLicense}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 border-2 border-emerald-200 rounded-xl px-4 py-3 bg-emerald-50">
                <div className="flex items-center justify-end gap-1.5 text-emerald-700">
                  <ReceiptText className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Bill No.</span>
                </div>
                <p className="text-base font-extrabold text-slate-900 mt-1">{invoice.id}</p>
                <p className="text-xs text-slate-600 mt-1">Date: <b>{invoice.date}</b></p>
                <p className="text-xs text-emerald-700 mt-0.5 font-semibold">
                  Payment: {invoice.paymentMethod || 'Cash'}
                  {invoice.paymentStatus ? ` · ${invoice.paymentStatus}` : (invoice.status ? ` · ${invoice.status}` : '')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-slate-700 mb-5">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/80">
                <p className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Bill To</p>
                <p className="font-bold text-sm text-slate-800 mt-1">{invoice.customer || 'Walk-in Customer'}</p>
                {invoice.customerAddress && (
                  <p className="text-slate-600 mt-1 whitespace-pre-line">{invoice.customerAddress}</p>
                )}
                {invoice.gstin && <p className="text-slate-500">GSTIN: {invoice.gstin}</p>}
              </div>
              <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/40">
                <p className="font-bold text-[10px] uppercase tracking-wider text-emerald-700">Prescription Details</p>
                {invoice.patient && <p className="text-slate-600 mt-1"><span className="font-semibold">Patient:</span> {invoice.patient}</p>}
                {invoice.doctor && <p className="text-slate-600"><span className="font-semibold">Doctor:</span> {invoice.doctor}</p>}
                {!invoice.patient && !invoice.doctor && <p className="text-slate-400 mt-1">No prescription details</p>}
              </div>
            </div>

            <table className="w-full border-collapse text-xs mb-4">
              <thead>
                <tr className="bg-emerald-800 text-white">
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-left">Mfr</th>
                  <th className="p-2 text-left">HSN</th>
                  <th className="p-2 text-left">Batch / Exp</th>
                  <th className="p-2 text-center">Qty</th>
                  <th className="p-2 text-right">Rate</th>
                  <th className="p-2 text-right">Disc %</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const discPercent = Math.min(100, Math.max(0, Number(item.discPercent) || 0));
                  const base = item.grossAmt ?? (item.qty * item.rate);
                  const rowTotal = item.total ?? Math.max(0, base - (base * discPercent) / 100);
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 border-b border-slate-100">{idx + 1}</td>
                      <td className="p-2 border-b border-slate-100 font-medium">{item.product?.name}</td>
                      <td className="p-2 border-b border-slate-100 text-slate-500">
                        {item.product?.manufacturer || item.manufacturer || '-'}
                      </td>
                      <td className="p-2 border-b border-slate-100 text-slate-500">{item.product?.hsn || '-'}</td>
                      <td className="p-2 border-b border-slate-100 text-slate-500">
                        <span className="block">{item.batch || item.product?.batch || '-'}</span>
                        <span className="text-[10px]">{formatExpiry(item.expiry || item.product?.expiry)}</span>
                      </td>
                      <td className="p-2 border-b border-slate-100 text-center font-bold">{item.qty}</td>
                      <td className="p-2 border-b border-slate-100 text-right">{fmt(item.rate)}</td>
                      <td className="p-2 border-b border-slate-100 text-right">{discPercent ? `${discPercent}%` : '—'}</td>
                      <td className="p-2 border-b border-slate-100 text-right font-semibold">{fmt(rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-72 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-red-600 font-medium">
                    <span>Line Discount</span><span>-{fmt(discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-base text-slate-900 border-t-2 border-emerald-700 pt-2">
                  <span>Grand Total</span>
                  <span className="text-emerald-700">{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-16 mt-12 text-xs text-slate-600">
              <div className="pt-2 border-t border-slate-400 text-center">Customer Signature</div>
              <div className="pt-2 border-t border-slate-400 text-center">
                <p className="font-semibold">For {company.name || 'Medicare Pharmacy'}</p>
                <p className="mt-1">Authorized Signatory</p>
              </div>
            </div>

            <div className="mt-7 pt-3 border-t border-dashed border-slate-300 text-center text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Thank you for your purchase</p>
              <p>Medicines once sold will not be taken back without a valid bill.</p>
            </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-surface-border bg-white flex-shrink-0">
          <button
            onClick={() => handlePrint()}
            className="btn-primary flex-1 justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print Bill
          </button>
          <button
            onClick={onNewBill}
            className="btn-success flex-1 justify-center"
          >
            + New Bill
          </button>
          <button onClick={onClose} className="btn-secondary px-5">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
