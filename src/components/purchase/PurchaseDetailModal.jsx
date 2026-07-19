import { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

export default function PurchaseDetailModal({ purchase, onClose }) {
  const { state } = useApp();
  const printRef = useRef(null);

  // Handle Printing
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `PurchaseOrder_${purchase?.id || 'details'}`,
  });

  if (!purchase) return null;

  const company = state.company || {};
  const items = Array.isArray(purchase.items) ? purchase.items : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-800">Purchase Order Details</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePrint()}
              className="btn-primary py-1.5 px-3 text-xs gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Content Area */}
        <div className="flex-1 overflow-y-auto p-6" ref={printRef}>
          <style>{`
            @media print {
              body {
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
              }
              .print-hide {
                display: none !important;
              }
            }
          `}</style>

          <div className="space-y-6">
            {/* Pharmacy Branding & PO Info */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-dashed border-slate-200 pb-6">
              <div>
                <h1 className="text-xl font-bold text-teal-600">{company.name || 'Medicare Pharmacy'}</h1>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">{company.address}</p>
                {company.phone && <p className="text-xs text-slate-500 mt-0.5">Phone: {company.phone}</p>}
                {company.gstin && <p className="text-xs text-slate-500 mt-0.5">GSTIN: {company.gstin}</p>}
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Purchase Order</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{purchase.id}</p>
                <p className="text-xs text-slate-500 mt-1">Date: {purchase.date}</p>
                <p className="text-xs text-slate-500 mt-0.5">Status: <span className="font-semibold text-teal-600">{purchase.status}</span></p>
              </div>
            </div>

            {/* Supplier Info */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Supplier Details</p>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-700">{purchase.supplier || 'Unknown Supplier'}</p>
              </div>
            </div>

            {/* Table of Items */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items Received</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Batch</th>
                      <th className="p-3">Expiry</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Purchase Rate</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-400">No items available on this order</td>
                      </tr>
                    ) : (
                      items.map((item, index) => {
                        const rowTotal = item.qty * item.rate;
                        return (
                          <tr key={index}>
                            <td className="p-3 font-medium text-slate-900">{item.product?.name || 'Unknown Product'}</td>
                            <td className="p-3">{item.product?.batch || item.batch || '-'}</td>
                            <td className="p-3">{item.product?.expiry || item.expiry || '-'}</td>
                            <td className="p-3 text-center font-semibold">{item.qty}</td>
                            <td className="p-3 text-right">₹{item.rate.toFixed(2)}</td>
                            <td className="p-3 text-right font-medium">₹{rowTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end pt-4">
              <div className="w-full max-w-xs space-y-2 text-xs">
                <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2">
                  <span>Total Amount</span>
                  <span className="text-teal-600">₹{purchase.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-surface-border flex justify-end gap-2 print-hide">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
