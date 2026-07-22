import { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Printer, CheckCircle, PackagePlus } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { formatExpiry } from '../../utils/expiry';

export default function PrintPurchaseModal({ purchase, onClose, onNewPurchase }) {
  const { state } = useApp();
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Purchase_${purchase.id}`,
  });

  if (!purchase) return null;

  const company = state.company || {};
  const items = Array.isArray(purchase.items) ? purchase.items : [];
  const seller =
    state.suppliers.find(s => Number(s.id) === Number(purchase.supplierId)) ||
    state.suppliers.find(s => s.name === purchase.supplier) ||
    null;

  const sellerName = purchase.supplier || seller?.name || 'Unknown Supplier';
  const sellerAddress = purchase.supplierAddress || seller?.address || '';
  const sellerPhone = purchase.supplierPhone || seller?.phone || '';
  const sellerGstin = purchase.supplierGstin || seller?.gstin || '';
  const sellerPan = purchase.supplierPan || seller?.pan || '';
  const sellerDl = purchase.supplierDrugLicense || seller?.drugLicense || '';

  const subtotal = items.reduce((sum, item) => {
    const line = item.total ?? (Number(item.qty) * Number(item.rate));
    return sum + Number(line || 0);
  }, 0);
  const grandTotal = Number(purchase.amount ?? subtotal);

  const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-600 to-emerald-500 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Purchase Added Successfully!</h2>
              <p className="text-teal-100 text-xs mt-0.5">
                PO {purchase.id} · {purchase.date} · Stock updated
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100/80 p-4">
          <div ref={printRef} className="bg-white p-6 sm:p-8 shadow-md mx-auto rounded-lg w-full" style={{ maxWidth: 900 }}>
            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .print-po {
                  width: 100% !important;
                  max-width: none !important;
                  box-shadow: none !important;
                  padding: 0 !important;
                  border-radius: 0 !important;
                }
                .print-items-wrap { overflow: visible !important; }
                .print-items-table {
                  width: 100% !important;
                  min-width: 0 !important;
                  table-layout: fixed !important;
                  font-size: 8.5px !important;
                }
                .print-items-table th,
                .print-items-table td {
                  padding: 3px 2px !important;
                  vertical-align: top;
                  overflow-wrap: anywhere;
                  word-break: break-word;
                }
                .print-items-table .col-amt,
                .print-items-table .col-rate {
                  white-space: nowrap !important;
                }
              }
            `}</style>

            <div className="print-po">
              <div className="flex items-start justify-between gap-6 border-b-[3px] border-teal-700 pb-4 mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600 mb-1">
                    Goods Received Note / Purchase Order
                  </p>
                  <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight uppercase">
                    {company.name || 'Medicare Pharmacy'}
                  </h1>
                  {company.address && (
                    <p className="text-xs text-slate-600 mt-1 max-w-md whitespace-pre-line">{company.address}</p>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-xs text-slate-600">
                    {company.phone && <span>Phone: {company.phone}</span>}
                    {company.email && <span>Email: {company.email}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-5 mt-1 text-xs text-slate-600">
                    {company.gstin && <span><b>GSTIN:</b> {company.gstin}</span>}
                    {company.drugLicense && <span><b>DL No:</b> {company.drugLicense}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 border-2 border-teal-200 rounded-xl px-4 py-3 bg-teal-50">
                  <div className="flex items-center justify-end gap-1.5 text-teal-700">
                    <PackagePlus className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">PO Number</span>
                  </div>
                  <p className="text-base font-extrabold text-slate-900 mt-1">{purchase.id}</p>
                  <p className="text-xs text-slate-600 mt-1">Date: <b>{purchase.date}</b></p>
                  <p className="text-xs text-teal-700 mt-0.5 font-semibold">Status: {purchase.status || 'Received'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700 mb-5 print:grid-cols-2">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/80 min-w-0 overflow-hidden">
                  <p className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Buyer (Pharmacy)</p>
                  <p className="font-bold text-sm text-slate-800 mt-1 break-words">{company.name || 'Medicare Pharmacy'}</p>
                  {company.address && (
                    <p className="text-slate-600 mt-1 whitespace-pre-line break-words">{company.address}</p>
                  )}
                  {company.phone && <p className="text-slate-500 mt-1 break-all">Phone: {company.phone}</p>}
                  {company.gstin && <p className="text-slate-500 break-all">GSTIN: {company.gstin}</p>}
                  {company.drugLicense && <p className="text-slate-500 break-words">DL No: {company.drugLicense}</p>}
                </div>
                <div className="border border-teal-200 rounded-xl p-3 bg-teal-50/50 min-w-0 overflow-hidden">
                  <p className="font-bold text-[10px] uppercase tracking-wider text-teal-600">Seller / Supplier</p>
                  <p className="font-bold text-sm text-slate-800 mt-1 break-words">{sellerName}</p>
                  {sellerAddress && (
                    <p className="text-slate-600 mt-1 whitespace-pre-line break-words">{sellerAddress}</p>
                  )}
                  {sellerPhone && <p className="text-slate-500 mt-1 break-all">Phone: {sellerPhone}</p>}
                  {sellerGstin && <p className="text-slate-500 break-all">GSTIN: {sellerGstin}</p>}
                  {sellerPan && <p className="text-slate-500 break-all">PAN: {sellerPan}</p>}
                  {sellerDl && <p className="text-slate-500 break-words">DL No: {sellerDl}</p>}
                </div>
              </div>

              <div className="overflow-x-auto -mx-1 px-1 mb-4 print-items-wrap">
              <table className="w-full border-collapse text-xs print-items-table" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-teal-800 text-white">
                    <th className="p-1.5 text-left">#</th>
                    <th className="p-1.5 text-left">Product</th>
                    <th className="p-1.5 text-left">Batch</th>
                    <th className="p-1.5 text-left">Exp</th>
                    <th className="p-1.5 text-center">Qty</th>
                    <th className="p-1.5 text-right col-rate">Rate</th>
                    <th className="p-1.5 text-right">Disc%</th>
                    <th className="p-1.5 text-right">GST%</th>
                    <th className="p-1.5 text-right col-amt">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const rowTotal = item.total ?? (Number(item.qty) * Number(item.rate));
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-1.5 border-b border-slate-100">{idx + 1}</td>
                        <td className="p-1.5 border-b border-slate-100 font-medium break-words">
                          {item.product?.name || 'Unknown Product'}
                        </td>
                        <td className="p-1.5 border-b border-slate-100 text-slate-500 break-all">
                          {item.batch || item.product?.batch || '-'}
                        </td>
                        <td className="p-1.5 border-b border-slate-100 text-slate-500 whitespace-nowrap">
                          {formatExpiry(item.expiry || item.product?.expiry)}
                        </td>
                        <td className="p-1.5 border-b border-slate-100 text-center font-bold">{item.qty}</td>
                        <td className="p-1.5 border-b border-slate-100 text-right col-rate whitespace-nowrap">{fmt(item.rate)}</td>
                        <td className="p-1.5 border-b border-slate-100 text-right">
                          {Number(item.discount) ? `${item.discount}%` : '—'}
                        </td>
                        <td className="p-1.5 border-b border-slate-100 text-right">
                          {item.gstPercent != null
                            ? `${item.gstPercent}%`
                            : `${(Number(item.cgst) || 0) + (Number(item.sgst) || 0)}%`}
                        </td>
                        <td className="p-1.5 border-b border-slate-100 text-right font-semibold col-amt whitespace-nowrap">{fmt(rowTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              <div className="flex justify-end">
                <div className="w-72 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
                  {(purchase.goodsValue != null || purchase.taxAmount != null) && (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Goods Value</span>
                        <span>{fmt(purchase.goodsValue ?? subtotal)}</span>
                      </div>
                      {Number(purchase.discountAmount) > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>
                            Total Disc
                            {Number(purchase.cashDiscPercent) > 0
                              ? ` (C.Disc ${purchase.cashDiscPercent}%)`
                              : ''}
                          </span>
                          <span>-{fmt(purchase.discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>GST</span>
                        <span>{fmt(purchase.taxAmount || 0)}</span>
                      </div>
                      {Number(purchase.roundOff) !== 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Rounded off</span>
                          <span>{fmt(purchase.roundOff)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between font-extrabold text-base text-slate-900 border-t-2 border-teal-700 pt-2">
                    <span>NET AMOUNT</span>
                    <span className="text-teal-700">{fmt(grandTotal)}</span>
                  </div>
                  {(purchase.paymentStatus || purchase.amountPaid != null) && (
                    <div className="pt-2 mt-1 border-t border-dashed border-slate-300 space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>Paid</span>
                        <span>{fmt(purchase.amountPaid ?? grandTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Due</span>
                        <span className={`font-bold ${Number(purchase.dueAmount) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmt(purchase.dueAmount || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-700 font-semibold">
                        <span>Payment</span>
                        <span>
                          {purchase.paymentMethod ? `${purchase.paymentMethod} · ` : ''}
                          {purchase.paymentStatus || 'Fully Paid'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-16 mt-12 text-xs text-slate-600">
                <div className="pt-2 border-t border-slate-400 text-center">Supplier Signature</div>
                <div className="pt-2 border-t border-slate-400 text-center">
                  <p className="font-semibold">For {company.name || 'Medicare Pharmacy'}</p>
                  <p className="mt-1">Authorized Signatory</p>
                </div>
              </div>

              <div className="mt-7 pt-3 border-t border-dashed border-slate-300 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700">Purchase recorded · Inventory updated</p>
                <p>Please verify batch, expiry and quantity against the supplier invoice.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-surface-border bg-white flex-shrink-0">
          <button onClick={() => handlePrint()} className="btn-teal flex-1 justify-center gap-2">
            <Printer className="w-4 h-4" />
            Print Purchase Order
          </button>
          <button onClick={onNewPurchase} className="btn-success flex-1 justify-center">
            + New Purchase
          </button>
          <button onClick={onClose} className="btn-secondary px-5">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
