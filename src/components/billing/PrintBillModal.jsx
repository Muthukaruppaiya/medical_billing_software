import { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Printer, CheckCircle, ReceiptText } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

export default function PrintBillModal({ invoice, onClose, onNewBill }) {
  const { state } = useApp();
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Bill_${invoice.id}`,
  });

  const company = state.company || {};
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  const subtotal = items.reduce((s, item) => s + item.qty * item.rate, 0);
  const grandTotal = invoice.amount ?? subtotal;

  const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[95vh] overflow-hidden">

        {/* Success Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 flex-shrink-0">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-white font-bold text-base">Bill Saved Successfully!</h2>
              <p className="text-emerald-100 text-xs mt-0.5">Invoice {invoice.id} · {invoice.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Bill Area */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div ref={printRef} className="bg-white p-8 shadow-sm mx-auto" style={{ maxWidth: 820 }}>

            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 9mm; }
                body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                .print-bill { width: 100% !important; max-width: none !important; box-shadow: none !important; padding: 0 !important; }
              }
            `}</style>

            {/* Bill Header */}
            <div className="print-bill">
            <div className="flex items-start justify-between gap-6 border-b-[3px] border-slate-900 pb-4 mb-4">
              <div>
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
              <div className="text-right shrink-0 border border-slate-300 rounded-lg px-4 py-3 bg-slate-50">
                <div className="flex items-center justify-end gap-1.5 text-slate-500">
                  <ReceiptText className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Tax Invoice / Bill No.</span>
                </div>
                <p className="text-base font-extrabold text-slate-900 mt-1">{invoice.id}</p>
                <p className="text-xs text-slate-600 mt-1">Date: <b>{invoice.date}</b></p>
              </div>
            </div>

            {/* Invoice Meta */}
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-700 mb-5">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Bill To</p>
                <p className="font-bold text-sm text-slate-800 mt-1">{invoice.customer || 'Walk-in Customer'}</p>
                {invoice.customerAddress && (
                  <p className="text-slate-600 mt-1 whitespace-pre-line">{invoice.customerAddress}</p>
                )}
                {invoice.gstin && <p className="text-slate-500">GSTIN: {invoice.gstin}</p>}
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Prescription Details</p>
                {invoice.patient && <p className="text-slate-600"><span className="font-semibold">Patient:</span> {invoice.patient}</p>}
                {invoice.doctor && <p className="text-slate-600"><span className="font-semibold">Doctor:</span> {invoice.doctor}</p>}
                {!invoice.patient && !invoice.doctor && <p className="text-slate-400 mt-1">No prescription details</p>}
                <p className="mt-1"><span className="font-semibold">Payment:</span> {invoice.status || 'Paid'}</p>
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full border-collapse text-xs mb-4">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-left">Manufacturer</th>
                  <th className="p-2 text-left">HSN</th>
                  <th className="p-2 text-left">Batch / Exp</th>
                  <th className="p-2 text-center">Qty</th>
                  <th className="p-2 text-right">Rate</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const base = item.qty * item.rate;
                  const rowTotal = item.total ?? base;
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
                        <span className="text-[10px]">{item.expiry || item.product?.expiry || '-'}</span>
                      </td>
                      <td className="p-2 border-b border-slate-100 text-center font-bold">{item.qty}</td>
                      <td className="p-2 border-b border-slate-100 text-right">{fmt(item.rate)}</td>
                      <td className="p-2 border-b border-slate-100 text-right font-semibold">{fmt(rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

             {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-danger font-medium">
                    <span>Discount</span><span>-{fmt(invoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-base text-slate-900 border-t-2 border-slate-800 pt-2">
                  <span>Grand Total</span>
                  <span className="text-emerald-700">{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-16 mt-12 text-xs text-slate-600">
              <div className="pt-2 border-t border-slate-400 text-center">Customer Signature</div>
              <div className="pt-2 border-t border-slate-400 text-center">
                <p className="font-semibold">For {company.name || 'Medicare Pharmacy'}</p>
                <p className="mt-1">Authorized Signatory</p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-7 pt-3 border-t border-dashed border-slate-300 text-center text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Thank you for your purchase</p>
              <p>Medicines once sold will not be taken back without a valid bill.</p>
            </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
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
