import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Calendar } from 'lucide-react';
import dayjs from 'dayjs';
import PurchaseDetailModal from '../purchase/PurchaseDetailModal';

export default function PurchaseReport() {
  const { state } = useApp();
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  
  // Date filters
  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));

  // Parse DD-MM-YYYY to timestamp for comparison
  const parseDate = (dStr) => {
    if (!dStr) return 0;
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }
    return 0;
  };

  // Filter purchase invoices based on date range
  const filteredPurchases = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate).getTime() : 0;
    const toTs = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : Infinity;
    
    return state.purchaseInvoices.filter(po => {
      const poTs = parseDate(po.date);
      return poTs >= fromTs && poTs <= toTs;
    });
  }, [state.purchaseInvoices, fromDate, toDate]);

  const total = filteredPurchases.reduce((s, i) => s + i.amount, 0);

  // Dynamically calculate supplier purchase breakdowns based on filtered data
  const supTotals = {};
  filteredPurchases.forEach(po => {
    supTotals[po.supplier] = (supTotals[po.supplier] || 0) + po.amount;
  });

  const supplierBreakdown = Object.keys(supTotals).map(name => ({
    name,
    amount: supTotals[name],
  })).sort((a, b) => b.amount - a.amount);

  const finalSupplierBreakdown = supplierBreakdown.length > 0 ? supplierBreakdown : [
    { name: 'No Purchase Data', amount: 0 }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters */}
      <div className="card flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="form-label text-xs">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="form-input pl-9 text-sm py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="form-label text-xs">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="form-input pl-9 text-sm py-1.5"
              />
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button className="btn-secondary text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />PDF
          </button>
          <button className="btn-success text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />Excel
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-teal-50/50">
          <p className="text-sm text-slate-500">Filtered Total Purchases</p>
          <p className="text-2xl font-bold text-teal-600 mt-1">₹{total.toLocaleString('en-IN')}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Purchase Orders</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{filteredPurchases.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Pending Orders (In Range)</p>
          <p className="text-2xl font-bold text-warning mt-1">
            {filteredPurchases.filter(i => i.status === 'Pending').length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="card col-span-1 border border-slate-100 shadow-sm" style={{ height: 320 }}>
          <h3 className="font-semibold text-slate-700 mb-4">Supplier Breakdown</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={finalSupplierBreakdown} layout="vertical" barSize={16} margin={{ left: 80, right: 20, top: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `₹${(v/1000).toFixed(0)}k`}
                     tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => `₹${v.toLocaleString('en-IN')}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
              <Bar dataKey="amount" name="Purchase Amount" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="card col-span-1 lg:col-span-2 border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-700">Purchase Orders</h3>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {filteredPurchases.length} POs Found
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">No purchase orders found in this date range.</td></tr>
                ) : (
                  filteredPurchases.map(po => (
                    <tr key={po.id}>
                      <td
                        className="font-medium text-teal-600 cursor-pointer hover:underline"
                        onClick={() => setSelectedPurchase(po)}
                      >
                        {po.id}
                      </td>
                      <td className="font-medium text-slate-700">{po.supplier}</td>
                      <td className="text-slate-500">{po.date}</td>
                      <td className="font-bold text-slate-800">₹{po.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={`badge ${po.status === 'Received' ? 'badge-success' : 'badge-warning'}`}>
                          {po.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedPurchase && (
        <PurchaseDetailModal
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
        />
      )}
    </div>
  );
}
