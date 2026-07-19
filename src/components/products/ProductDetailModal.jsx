import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Package, ShoppingCart, TrendingUp, Tag, Info, Pill, MapPin, Box } from 'lucide-react';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function ProductDetailModal({ product: p, onClose }) {
  const { state } = useApp();

  // ── Gather all sale transactions for this product ────────────────────────
  const salesTxns = useMemo(() => {
    const rows = [];
    (state.invoices || []).forEach(inv => {
      if (inv.type === 'sale' && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const pid = item.product?.id || item.productId;
          if (pid === p.id || (item.product?.name || item.name || '').toLowerCase() === p.name.toLowerCase()) {
            rows.push({
              id: inv.id,
              date: inv.date,
              customer: inv.customer || 'Walk-in',
              qty: Number(item.qty || 0),
              rate: Number(item.rate || 0),
              total: Number(item.qty || 0) * Number(item.rate || 0),
            });
          }
        });
      }
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [state.invoices, p]);

  // ── Gather all purchase transactions for this product ───────────────────
  const purchaseTxns = useMemo(() => {
    const rows = [];
    (state.purchaseInvoices || []).forEach(inv => {
      if (Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const pid = item.product?.id || item.productId;
          if (pid === p.id || (item.product?.name || item.name || '').toLowerCase() === p.name.toLowerCase()) {
            rows.push({
              id: inv.id,
              date: inv.date,
              supplier: inv.supplier || '—',
              qty: Number(item.qty || 0),
              rate: Number(item.rate || 0),
              total: Number(item.qty || 0) * Number(item.rate || 0),
            });
          }
        });
      }
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [state.purchaseInvoices, p]);

  const totalSold = salesTxns.reduce((s, r) => s + r.qty, 0);
  const totalPurchased = purchaseTxns.reduce((s, r) => s + r.qty, 0);
  const totalSalesValue = salesTxns.reduce((s, r) => s + r.total, 0);
  const totalPurchaseValue = purchaseTxns.reduce((s, r) => s + r.total, 0);

  // stock status colour
  const stockColor = p.stock === 0 ? '#dc2626' : p.stock <= (p.minStock || 5) ? '#d97706' : '#16a34a';

  const fields = [
    { label: 'HSN Code', value: p.hsn || '—' },
    { label: 'Active Batches', value: `${p.batches?.length || 0}` },
    { label: 'Pack Type', value: p.packType || '—' },
    { label: 'Grams / Volume', value: p.grams || '—' },
    { label: 'Manufacturer', value: p.manufacturer || '—' },
    { label: 'Category', value: p.category || '—' },
    { label: 'MRP', value: fmt(p.mrp) },
    { label: 'Purchase Rate', value: fmt(p.rate) },
    { label: 'Min Stock', value: `${p.minStock || 0} units` },
    { label: 'GST Rate', value: p.gst ? `${p.gst}%` : '—' },
    { label: 'Box No.', value: p.boxNo || '—' },
    { label: 'Rack Location', value: p.rackLocation || '—' },
    { label: 'Current Stock', value: `${p.stock} units`, color: stockColor },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      style={{ overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full my-4"
        style={{ maxWidth: '860px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Pill className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{p.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {[p.manufacturer, p.category, p.grams].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── 4 KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Current Stock', value: `${p.stock}`, sub: 'units', color: stockColor, icon: Package },
              { label: 'Total Purchased', value: `${totalPurchased}`, sub: 'units', color: '#2563eb', icon: TrendingUp },
              { label: 'Total Sold', value: `${totalSold}`, sub: 'units', color: '#7c3aed', icon: ShoppingCart },
              { label: 'Sales Revenue', value: fmt(totalSalesValue), sub: '', color: '#059669', icon: Tag },
            ].map(card => (
              <div key={card.label} className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                <card.icon className="w-5 h-5 mx-auto mb-2" style={{ color: card.color }} />
                <div className="text-xl font-bold" style={{ color: card.color }}>{card.value}</div>
                {card.sub && <div className="text-xs text-slate-400">{card.sub}</div>}
                <div className="text-xs text-slate-500 mt-1 font-medium">{card.label}</div>
              </div>
            ))}
          </div>

          {/* ── Product Details ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-slate-700 text-sm">Product Information</span>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              {fields.map(f => (
                <div key={f.label}>
                  <div className="text-xs text-slate-400 font-medium mb-0.5">{f.label}</div>
                  <div className="font-semibold text-slate-700" style={f.color ? { color: f.color } : {}}>
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {p.batches?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <span className="font-semibold text-slate-700 text-sm">Batch Inventory</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Batch No.', 'Expiry', 'Stock', 'Rate', 'MRP'].map(header => (
                        <th key={header} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.batches.map(batch => (
                      <tr key={batch.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-semibold text-slate-700">{batch.batch}</td>
                        <td className="px-4 py-3 text-slate-600">{batch.expiry || '—'}</td>
                        <td className="px-4 py-3 font-semibold">{batch.stock}</td>
                        <td className="px-4 py-3">{fmt(batch.rate)}</td>
                        <td className="px-4 py-3">{fmt(batch.mrp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Purchase History ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-slate-700 text-sm">Purchase History</span>
                <span className="text-xs text-slate-400">({purchaseTxns.length} records)</span>
              </div>
              <span className="text-xs font-semibold text-blue-700">{fmt(totalPurchaseValue)} total</span>
            </div>
            {purchaseTxns.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No purchase records found for this item</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['PO #', 'Date', 'Supplier', 'Qty', 'Rate', 'Total'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseTxns.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{t.id}</td>
                        <td className="px-4 py-3 text-slate-500">{t.date}</td>
                        <td className="px-4 py-3 text-slate-700">{t.supplier}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{t.qty}</td>
                        <td className="px-4 py-3 text-slate-600">{fmt(t.rate)}</td>
                        <td className="px-4 py-3 font-bold text-blue-700">{fmt(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Sales History ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-700 text-sm">Sales History</span>
                <span className="text-xs text-slate-400">({salesTxns.length} records)</span>
              </div>
              <span className="text-xs font-semibold text-emerald-700">{fmt(totalSalesValue)} total</span>
            </div>
            {salesTxns.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No sales records found for this item</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Invoice #', 'Date', 'Customer', 'Qty', 'Rate', 'Total'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {salesTxns.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-emerald-600 font-semibold">{t.id}</td>
                        <td className="px-4 py-3 text-slate-500">{t.date}</td>
                        <td className="px-4 py-3 text-slate-700">{t.customer}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{t.qty}</td>
                        <td className="px-4 py-3 text-slate-600">{fmt(t.rate)}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700">{fmt(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
