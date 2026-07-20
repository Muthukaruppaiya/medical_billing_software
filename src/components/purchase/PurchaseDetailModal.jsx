import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Printer, FileText, ExternalLink, Upload } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { formatExpiry } from '../../utils/expiry';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PurchaseDetailModal({ purchase, onClose, onPurchaseUpdated }) {
  const { state, dispatch } = useApp();
  const printRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attaching, setAttaching] = useState(false);
  const [localPurchase, setLocalPurchase] = useState(purchase);

  useEffect(() => {
    setLocalPurchase(purchase);
  }, [purchase]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `PurchaseOrder_${localPurchase?.id || 'details'}`,
  });

  if (!localPurchase) return null;

  const company = state.company || {};
  const items = Array.isArray(localPurchase.items) ? localPurchase.items : [];
  const hasDocument = Boolean(localPurchase.hasDocument || localPurchase.documentName);
  const documentUrl = hasDocument
    ? `/api/purchase-invoices/${encodeURIComponent(localPurchase.id)}/document`
    : '';

  const handleAttachDocument = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAttaching(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const result = await dispatch({
        type: 'ATTACH_PURCHASE_DOCUMENT',
        payload: {
          id: localPurchase.id,
          document: {
            name: file.name,
            mime: file.type || 'application/octet-stream',
            dataBase64,
          },
        },
      });
      const updated = {
        ...localPurchase,
        documentName: result.documentName,
        documentMime: result.documentMime,
        hasDocument: true,
      };
      setLocalPurchase(updated);
      onPurchaseUpdated?.(updated);
    } catch (error) {
      alert(error.message || 'Failed to attach document');
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-800">Purchase Order Details</h2>
          <div className="flex items-center gap-2">
            {hasDocument && (
              <a
                href={documentUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary py-1.5 px-3 text-xs gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Document
              </a>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attaching}
              className="btn-secondary py-1.5 px-3 text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {attaching ? 'Attaching…' : hasDocument ? 'Replace Document' : 'Attach Document'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={handleAttachDocument}
            />
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

        <div className="flex-1 overflow-y-auto p-6" ref={printRef}>
          <style>{`
            @media print {
              body { -webkit-print-color-adjust: exact; color-adjust: exact; }
              .print-hide { display: none !important; }
            }
          `}</style>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-dashed border-slate-200 pb-6">
              <div>
                <h1 className="text-xl font-bold text-teal-600">{company.name || 'Medicare Pharmacy'}</h1>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">{company.address}</p>
                {company.phone && <p className="text-xs text-slate-500 mt-0.5">Phone: {company.phone}</p>}
                {company.gstin && <p className="text-xs text-slate-500 mt-0.5">GSTIN: {company.gstin}</p>}
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Purchase Order</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{localPurchase.id}</p>
                <p className="text-xs text-slate-500 mt-1">Date: {localPurchase.date}</p>
                <p className="text-xs text-slate-500 mt-0.5">Status: <span className="font-semibold text-teal-600">{localPurchase.status}</span></p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Supplier Details</p>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-700">{localPurchase.supplier || 'Unknown Supplier'}</p>
              </div>
            </div>

            {hasDocument ? (
              <div className="print-hide">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Uploaded Purchase Document
                </p>
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white">
                    <FileText className="w-4 h-4 text-primary-500" />
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {localPurchase.documentName || 'Purchase document'}
                    </span>
                  </div>
                  {(localPurchase.documentMime || '').includes('pdf') ? (
                    <iframe
                      title="Purchase document"
                      src={documentUrl}
                      className="w-full h-96 bg-white"
                    />
                  ) : (
                    <div className="p-4 flex justify-center">
                      <img
                        src={documentUrl}
                        alt={localPurchase.documentName || 'Purchase document'}
                        className="max-h-96 object-contain rounded-lg border border-slate-200"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="print-hide rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                <p className="text-sm text-slate-600">No document attached to this purchase.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attaching}
                  className="mt-3 btn-secondary py-1.5 px-3 text-xs gap-1.5 inline-flex"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {attaching ? 'Attaching…' : 'Attach PDF / Image'}
                </button>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items Received</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3">PRODUCT NAME</th>
                      <th className="p-3">BATCH</th>
                      <th className="p-3">EXP</th>
                      <th className="p-3 text-center">QTY</th>
                      <th className="p-3 text-right">RATE</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-400">No items available on this order</td>
                      </tr>
                    ) : (
                      items.map((item, index) => {
                        const rowTotal = item.total ?? (item.qty * item.rate);
                        return (
                          <tr key={index}>
                            <td className="p-3 font-medium text-slate-900">{item.product?.name || 'Unknown Product'}</td>
                            <td className="p-3">{item.product?.batch || item.batch || '-'}</td>
                            <td className="p-3">{formatExpiry(item.product?.expiry || item.expiry)}</td>
                            <td className="p-3 text-center font-semibold">{item.qty}</td>
                            <td className="p-3 text-right">₹{Number(item.rate || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-medium">₹{Number(rowTotal || 0).toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <div className="w-full max-w-xs space-y-2 text-xs">
                <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2">
                  <span>Total Amount</span>
                  <span className="text-teal-600">₹{Number(localPurchase.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

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
