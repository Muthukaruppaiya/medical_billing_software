import { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Printer, Trash2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

export default function InvoiceDetailModal({ invoice, onClose }) {
  const { state, dispatch } = useApp();
  const printRef = useRef(null);
  const [deleting, setDeleting] = useState(false);

  // Handle Printing
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Invoice_${invoice?.id || 'details'}`,
  });

  if (!invoice) return null;

  const company = state.company || {};
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete invoice ${invoice.id}?\n\nAll item quantities will be returned to their original batches. This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await dispatch({ type: 'DELETE_INVOICE', payload: invoice.id });
      onClose();
    } catch (error) {
      alert(error.message || 'Failed to delete invoice');
      setDeleting(false);
    }
  };

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.qty * item.rate), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-800">Invoice Details</h2>
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
          {/* Printable Styles (Only applied during print) */}
          <style>{`
            @media print {
              body {
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
              }
              .print-hide {
                display: none !important;
              }
              .print-p-0 {
                padding: 0 !important;
              }
            }
          `}</style>

          <div className="space-y-6">
            {/* Pharmacy Branding & Invoice Info */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-dashed border-slate-200 pb-6">
              <div>
                <h1 className="text-xl font-bold text-primary-600">{company.name || 'Medicare Pharmacy'}</h1>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">{company.address}</p>
                {company.phone && <p className="text-xs text-slate-500 mt-0.5">Phone: {company.phone}</p>}
                {company.gstin && <p className="text-xs text-slate-500 mt-0.5">GSTIN: {company.gstin}</p>}
                {company.drugLicense && <p className="text-xs text-slate-500 mt-0.5">Drug License: {company.drugLicense}</p>}
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{invoice.id}</p>
                <p className="text-xs text-slate-500 mt-1">Date: {invoice.date}</p>
                <p className="text-xs text-slate-500 mt-0.5">Status: <span className="font-semibold text-success">{invoice.status}</span></p>
              </div>
            </div>

            {/* Bill To Customer */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-700">{invoice.customer || 'Walk-in Customer'}</p>
                {invoice.phone && <p className="text-xs text-slate-500 mt-1">Phone: {invoice.phone}</p>}
                {invoice.customerAddress && (
                  <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{invoice.customerAddress}</p>
                )}
                {invoice.gstin && <p className="text-xs text-slate-500 mt-0.5">GSTIN: {invoice.gstin}</p>}
                {invoice.patient && <p className="text-xs text-slate-500 mt-0.5"><span className="font-semibold">Patient:</span> {invoice.patient}</p>}
                {invoice.doctor && <p className="text-xs text-slate-500 mt-0.5"><span className="font-semibold">Doctor:</span> {invoice.doctor}</p>}
              </div>
            </div>

            {/* Table of Items */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items Sold</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Manufacturer</th>
                      <th className="p-3">HSN</th>
                      <th className="p-3">Batch</th>
                      <th className="p-3">Expiry</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-slate-400">No items available on this invoice</td>
                      </tr>
                    ) : (
                      items.map((item, index) => {
                        const rowTotal = item.qty * item.rate;
                        return (
                          <tr key={index}>
                            <td className="p-3 font-medium text-slate-900">{item.product?.name || 'Unknown Product'}</td>
                            <td className="p-3">{item.product?.manufacturer || item.manufacturer || '-'}</td>
                            <td className="p-3">{item.product?.hsn || '-'}</td>
                            <td className="p-3">{item.batch || item.product?.batch || '-'}</td>
                            <td className="p-3">{item.expiry || item.product?.expiry || '-'}</td>
                            <td className="p-3 text-center font-semibold">{item.qty}</td>
                            <td className="p-3 text-right">₹{item.rate.toFixed(2)}</td>
                            <td className="p-3 text-right font-medium">₹{Number(item.total ?? rowTotal).toFixed(2)}</td>
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
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-danger font-medium">
                    <span>Discount</span>
                    <span>-₹{Number(invoice.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2">
                  <span>Grand Total</span>
                  <span className="text-primary-600">₹{Number(invoice.amount || subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-16 pt-12 text-xs text-slate-600">
              <div className="border-t border-slate-400 pt-2 text-center">Customer Signature</div>
              <div className="border-t border-slate-400 pt-2 text-center">
                <p className="font-semibold">For {company.name || 'Medicare Pharmacy'}</p>
                <p className="mt-1">Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-surface-border flex justify-end gap-2 print-hide">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="mr-auto px-4 py-2 text-xs font-semibold text-danger bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Restoring Stock...' : 'Delete Invoice'}
          </button>
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
