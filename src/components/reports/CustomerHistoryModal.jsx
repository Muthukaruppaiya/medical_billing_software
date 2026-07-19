import { useRef } from 'react';
import { X, Printer, User } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useApp } from '../../context/AppContext';

const money = value =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function CustomerHistoryModal({ customer, invoices, onClose }) {
  const { state } = useApp();
  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Customer_History_${customer.name.replace(/\s+/g, '_')}`,
  });

  const totalSpent = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount || 0),
    0
  );
  const totalItems = invoices.reduce(
    (sum, invoice) =>
      sum + (invoice.items || []).reduce((qty, item) => qty + Number(item.qty || 0), 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Customer Purchase History</h2>
              <p className="text-xs text-slate-400">{customer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div ref={printRef} className="bg-white p-6 rounded-xl">
            <style>{`
              @media print {
                @page { margin: 10mm; }
                body { -webkit-print-color-adjust: exact; color-adjust: exact; }
              }
            `}</style>

            <div className="flex justify-between gap-6 border-b-2 border-slate-800 pb-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  {state.company?.name || 'MediCare Pharmacy'}
                </h1>
                {state.company?.address && (
                  <p className="text-xs text-slate-500 mt-1">{state.company.address}</p>
                )}
              </div>
              <div className="text-right text-xs text-slate-600">
                <p className="font-bold text-base text-slate-800">{customer.name}</p>
                {customer.phone && <p>Phone: {customer.phone}</p>}
                {customer.email && <p>Email: {customer.email}</p>}
                {customer.address && <p>{customer.address}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 my-5">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400">Invoices</p>
                <p className="text-lg font-bold text-slate-800">{invoices.length}</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400">Units Purchased</p>
                <p className="text-lg font-bold text-slate-800">{totalItems}</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400">Total Purchase Value</p>
                <p className="text-lg font-bold text-primary-600">{money(totalSpent)}</p>
              </div>
            </div>

            {invoices.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                No purchase history found for this customer.
              </div>
            ) : (
              <div className="space-y-5">
                {invoices.map(invoice => (
                  <div key={invoice.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{invoice.id}</span>
                        <span className="text-slate-400 ml-3">{invoice.date}</span>
                      </div>
                      <div className="font-bold text-slate-800">{money(invoice.amount)}</div>
                    </div>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-100">
                          <th className="p-2 text-left">Medicine / Product</th>
                          <th className="p-2 text-left">Batch</th>
                          <th className="p-2 text-center">Qty</th>
                          <th className="p-2 text-right">Rate</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(invoice.items || []).map((item, index) => (
                          <tr key={`${invoice.id}-${index}`} className="border-b border-slate-100 last:border-0">
                            <td className="p-2 font-medium text-slate-700">
                              {item.product?.name || 'Unknown Product'}
                            </td>
                            <td className="p-2 text-slate-500">
                              {item.batch || item.product?.batch || '—'}
                            </td>
                            <td className="p-2 text-center">{item.qty}</td>
                            <td className="p-2 text-right">{money(item.rate)}</td>
                            <td className="p-2 text-right font-semibold">
                              {money(Number(item.qty || 0) * Number(item.rate || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(invoice.patient || invoice.doctor) && (
                      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
                        {invoice.patient && <span>Patient: {invoice.patient}</span>}
                        {invoice.patient && invoice.doctor && <span className="mx-2">·</span>}
                        {invoice.doctor && <span>Doctor: {invoice.doctor}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-center text-[11px] text-slate-400 mt-6 pt-3 border-t border-slate-200">
              Complete customer purchase history generated from sales invoices.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => handlePrint()} className="btn-primary gap-2">
            <Printer className="w-4 h-4" />
            Print History
          </button>
        </div>
      </div>
    </div>
  );
}
