import { useApp } from '../../context/AppContext';
import clsx from 'clsx';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import InvoiceDetailModal from '../billing/InvoiceDetailModal';

const PAGE_SIZE = 5;

export default function RecentTable() {
  const { state } = useApp();
  const [page, setPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const total = state.invoices.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const slice = state.invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-700">Recent Transactions Table</h3>
        <span className="text-xs text-slate-400">
          Page {page} of {totalPages}
        </span>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(inv => (
              <tr key={inv.id}>
                <td 
                  className="font-medium text-primary-600 cursor-pointer hover:underline"
                  onClick={() => setSelectedInvoice(inv)}
                >
                  {inv.id}
                </td>
                <td>{inv.customer}</td>
                <td className="text-slate-500">{inv.date}</td>
                <td className="font-semibold">₹{inv.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>
                  <span className={clsx(
                    'badge',
                    inv.status === 'Paid'    && 'badge-success',
                    inv.status === 'Unpaid'  && 'badge-danger',
                    inv.status === 'Pending' && 'badge-warning',
                  )}>
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="w-7 h-7 rounded-md border border-surface-border flex items-center justify-center
                     text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="w-7 h-7 rounded-md border border-surface-border flex items-center justify-center
                     text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pop-up modal */}
      {selectedInvoice && (
        <InvoiceDetailModal 
          invoice={selectedInvoice} 
          onClose={() => setSelectedInvoice(null)} 
        />
      )}
    </div>
  );
}
