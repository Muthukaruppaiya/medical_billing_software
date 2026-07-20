import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import StockBadge from './StockBadge';
import BulkImportModal from './BulkImportModal';
import InventoryAdjustmentModal from './InventoryAdjustmentModal';
import { Search, Plus, Edit2, Trash2, X, Package, ShoppingCart, TrendingUp, Tag, Info, UploadCloud, SlidersHorizontal, PackagePlus } from 'lucide-react';
import clsx from 'clsx';
import { formatExpiry, expiryDaysLeft } from '../../utils/expiry';

const CATEGORIES = ['All', 'Tablet', 'Capsule', 'Syrup', 'Liquid', 'Injection', 'Inhaler', 'Ointment', 'Others'];
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

// ═══════════════════════════════════════════════════════════════════════════════
// ── Inline Product Detail Popup ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function ProductDetailPopup({ product: p, onClose, invoices, purchaseInvoices }) {
  const salesTxns = useMemo(() => {
    const rows = [];
    (invoices || []).forEach(inv => {
      if (inv.type === 'sale' && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const pid = item.product?.id || item.productId;
          if (pid === p.id || (item.product?.name || item.name || '').toLowerCase() === p.name.toLowerCase()) {
            rows.push({
              id: inv.id, date: inv.date, customer: inv.customer || 'Walk-in',
              qty: Number(item.qty || 0), rate: Number(item.rate || 0),
              total: Number(item.qty || 0) * Number(item.rate || 0),
            });
          }
        });
      }
    });
    return rows;
  }, [invoices, p]);

  const purchaseTxns = useMemo(() => {
    const rows = [];
    (purchaseInvoices || []).forEach(inv => {
      if (Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const pid = item.product?.id || item.productId;
          if (pid === p.id || (item.product?.name || item.name || '').toLowerCase() === p.name.toLowerCase()) {
            rows.push({
              id: inv.id, date: inv.date, supplier: inv.supplier || '—',
              qty: Number(item.qty || 0), rate: Number(item.rate || 0),
              total: Number(item.qty || 0) * Number(item.rate || 0),
            });
          }
        });
      }
    });
    return rows;
  }, [purchaseInvoices, p]);

  const totalSold = salesTxns.reduce((s, r) => s + r.qty, 0);
  const totalPurchased = purchaseTxns.reduce((s, r) => s + r.qty, 0);
  const totalSalesValue = salesTxns.reduce((s, r) => s + r.total, 0);
  const totalPurchaseValue = purchaseTxns.reduce((s, r) => s + r.total, 0);

  const expiryDiff = expiryDaysLeft(p.expiry);
  const expiryColor = expiryDiff == null ? '#64748b' : expiryDiff < 0 ? '#dc2626' : expiryDiff <= 30 ? '#ef4444' : expiryDiff <= 90 ? '#d97706' : '#16a34a';
  const stockColor = p.stock === 0 ? '#dc2626' : p.stock <= (p.minStock || 5) ? '#d97706' : '#16a34a';

  const fields = [
    { label: 'HSN Code', value: p.hsn || '—' },
    { label: 'Batch No.', value: p.batch || '—' },
    { label: 'Pack Type', value: p.packType || '—' },
    { label: 'Grams / Volume', value: p.grams || '—' },
    { label: 'Manufacturer', value: p.manufacturer || '—' },
    { label: 'Category', value: p.category || '—' },
    { label: 'MRP', value: fmt(p.mrp) },
    { label: 'Purchase Rate', value: fmt(p.purchaseRate) },
    { label: 'Sale Rate', value: fmt(p.rate) },
    { label: 'Min Stock', value: `${p.minStock || 0} units` },
    { label: 'GST Rate', value: p.gst ? `${p.gst}%` : '—' },
    { label: 'Box No.', value: p.boxNo || '—' },
    { label: 'Rack Location', value: p.rackLocation || '—' },
    { label: 'EXP (MM/YY)', value: formatExpiry(p.expiry), color: expiryColor },
    { label: 'Current Stock', value: `${p.stock} units`, color: stockColor },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
        padding: '16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '860px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: '16px 0',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package style={{ width: '20px', height: '20px', color: '#2563eb' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{p.name}</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                {[p.manufacturer, p.category, p.grams].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* 4 KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Current Stock', value: `${p.stock}`, sub: 'units', color: stockColor, Icon: Package },
              { label: 'Total Purchased', value: `${totalPurchased}`, sub: 'units', color: '#2563eb', Icon: TrendingUp },
              { label: 'Total Sold', value: `${totalSold}`, sub: 'units', color: '#7c3aed', Icon: ShoppingCart },
              { label: 'Sales Revenue', value: fmt(totalSalesValue), sub: '', color: '#059669', Icon: Tag },
            ].map(card => (
              <div key={card.label} style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <card.Icon style={{ width: '20px', height: '20px', margin: '0 auto 8px', color: card.color }} />
                <div style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value}</div>
                {card.sub && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{card.sub}</div>}
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Product Details Grid */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
              <span style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>Product Information</span>
            </div>
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 32px' }}>
              {fields.map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
                  <div style={{ fontWeight: 600, color: f.color || '#334155', fontSize: '14px' }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Purchase History */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp style={{ width: '16px', height: '16px', color: '#2563eb' }} />
                <span style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>Purchase History</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>({purchaseTxns.length})</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8' }}>{fmt(totalPurchaseValue)} total</span>
            </div>
            {purchaseTxns.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No purchase records found</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['PO #', 'Date', 'Supplier', 'Qty', 'Rate', 'Total'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {purchaseTxns.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>{t.id}</td>
                      <td style={{ padding: '10px 16px', color: '#64748b' }}>{t.date}</td>
                      <td style={{ padding: '10px 16px', color: '#334155' }}>{t.supplier}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b' }}>{t.qty}</td>
                      <td style={{ padding: '10px 16px', color: '#475569' }}>{fmt(t.rate)}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1d4ed8' }}>{fmt(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Sales History */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart style={{ width: '16px', height: '16px', color: '#059669' }} />
                <span style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>Sales History</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>({salesTxns.length})</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#047857' }}>{fmt(totalSalesValue)} total</span>
            </div>
            {salesTxns.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No sales records found</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Invoice #', 'Date', 'Customer', 'Qty', 'Rate', 'Total'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salesTxns.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#059669', fontWeight: 600 }}>{t.id}</td>
                      <td style={{ padding: '10px 16px', color: '#64748b' }}>{t.date}</td>
                      <td style={{ padding: '10px 16px', color: '#334155' }}>{t.customer}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b' }}>{t.qty}</td>
                      <td style={{ padding: '10px 16px', color: '#475569' }}>{fmt(t.rate)}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#047857' }}>{fmt(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', color: '#334155', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ── Product Table ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function ProductTable({ onAdd, onEdit }) {
  const { state, dispatch } = useApp();
  const [query, setQuery]    = useState('');
  const [catFilter, setCat]  = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustMode, setAdjustMode] = useState('adjust');
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [catalogStats, setCatalogStats] = useState({ catalog: 0, inventory: 0, total: 0 });
  const [viewMode, setViewMode] = useState('inventory');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogData, setCatalogData] = useState({
    products: [], total: 0, totalPages: 1,
  });
  const [catalogLoading, setCatalogLoading] = useState(false);

  const refreshCatalogStats = () => {
    fetch('/api/products/catalog-stats')
      .then(response => response.json())
      .then(data => setCatalogStats({
        catalog: Number(data.catalog) || 0,
        inventory: Number(data.inventory) || 0,
        total: Number(data.total) || 0,
      }))
      .catch(() => setCatalogStats({ catalog: 0, inventory: 0, total: 0 }));
  };

  useEffect(() => {
    refreshCatalogStats();
  }, [state.products.length]);

  useEffect(() => {
    if (viewMode !== 'all') return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const response = await fetch(
          `/api/products/catalog?page=${catalogPage}&limit=50&q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load medicine catalog');
        setCatalogData(data);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error(error);
          setCatalogData({ products: [], total: 0, totalPages: 1 });
        }
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [viewMode, catalogPage, query]);

  const products = state.products.filter(p => {
    const matchQ = p.name.toLowerCase().includes(query.toLowerCase()) ||
                   (p.hsn || '').includes(query) ||
                   (p.manufacturer || '').toLowerCase().includes(query.toLowerCase()) ||
                   (p.boxNo || '').toLowerCase().includes(query.toLowerCase()) ||
                   (p.rackLocation || '').toLowerCase().includes(query.toLowerCase());
    const matchC = catFilter === 'All' || p.category === catFilter;
    return matchQ && matchC;
  });

  const handleDelete = (id) => {
    if (confirm('Delete this product?')) dispatch({ type: 'DELETE_PRODUCT', payload: id });
  };

  const changeView = mode => {
    setViewMode(mode);
    setQuery('');
    setCat('All');
    setCatalogPage(1);
  };

  const expiryColor = (exp) => {
    const diff = expiryDaysLeft(exp);
    if (diff == null) return 'text-slate-600';
    if (diff < 0)   return 'text-danger font-semibold';
    if (diff <= 30) return 'text-danger';
    if (diff <= 90) return 'text-warning';
    return 'text-slate-600';
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => changeView('inventory')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            viewMode === 'inventory'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Stock Inventory ({catalogStats.inventory.toLocaleString('en-IN')})
        </button>
        <button
          type="button"
          onClick={() => changeView('all')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            viewMode === 'all'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          All Medicines ({catalogStats.total.toLocaleString('en-IN')})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setCatalogPage(1);
            }}
            placeholder={
              viewMode === 'all'
                ? 'Search all medicines by name, HSN or manufacturer...'
                : 'Search products, HSN, manufacturer...'
            }
            className="form-input pl-9"
          />
        </div>

        {viewMode === 'inventory' && <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCat(cat)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                catFilter === cat
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-white border border-surface-border text-slate-600 hover:bg-slate-50'
              )}
            >
              {cat}
            </button>
          ))}
        </div>}

        <button onClick={() => setImportModalOpen(true)} className="btn-secondary ml-auto">
          <UploadCloud className="w-4 h-4 mr-2" />
          Inventory Upload
        </button>
        <button onClick={onAdd} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Add Product
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span>
          {viewMode === 'all'
            ? `${catalogData.total.toLocaleString('en-IN')} medicines found`
            : `${products.length} stocked products shown`}
        </span>
        <span>·</span>
        <span className="text-primary-600 font-semibold">
          {(catalogStats.catalog || 0).toLocaleString('en-IN')} medicines in catalog
        </span>
        <span>·</span>
        <span className="text-danger">{state.products.filter(p => p.stock === 0).length} out of stock</span>
        <span>·</span>
        <span className="text-warning">{state.products.filter(p => p.stock > 0 && p.stock <= p.minStock).length} low stock</span>
      </div>
      {catalogStats.catalog > 0 && (
        <p className="text-xs text-slate-400 -mt-2">
          {viewMode === 'all'
            ? 'Zero-stock catalog medicines are included. Use Add Stock for temporary stock, or purchase to activate batch stock.'
            : 'Catalog medicines are searchable in New Purchase. After purchase (or Add Stock) they appear here with stock.'}
        </p>
      )}

      {/* Table */}
      {viewMode === 'inventory' ? (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th>Category</th>
              <th>HSN</th>
              <th>Batch</th>
              <th>Grams/Vol</th>
              <th>MRP</th>
              <th>Purchase Rate</th>
              <th>Sale Rate</th>
              <th>Stock</th>
              <th>Status</th>
              <th>EXP</th>
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-10 text-slate-400">No products found</td></tr>
            ) : (
              products.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td>
                    <span
                      style={{ color: '#2563eb', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', userSelect: 'none' }}
                      onClick={() => setSelectedProduct(p)}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.manufacturer}{p.grams ? ` · ${p.grams}` : ''}</p>
                  </td>
                  <td><span className="badge badge-info">{p.category}</span></td>
                  <td className="text-slate-500 font-mono text-xs">{p.hsn}</td>
                  <td className="text-slate-500 text-xs">{p.batch}</td>
                  <td className="text-slate-500 text-xs">{p.grams || '—'}</td>
                  <td className="font-medium">₹{p.mrp}</td>
                  <td className="font-medium text-slate-600">₹{p.purchaseRate || 0}</td>
                  <td className="font-medium text-primary-600">₹{p.rate}</td>
                  <td className="font-semibold">{p.stock}</td>
                  <td><StockBadge stock={p.stock} minStock={p.minStock} /></td>
                  <td className={expiryColor(p.expiry)}>{formatExpiry(p.expiry)}</td>
                  <td>
                    <div className="text-xs text-slate-500 space-y-0.5">
                      {p.boxNo && <p className="flex items-center gap-1">📦 {p.boxNo}</p>}
                      {p.rackLocation && <p className="flex items-center gap-1">📍 {p.rackLocation}</p>}
                      {!p.boxNo && !p.rackLocation && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setAdjustMode('adjust');
                          setAdjustingProduct(p);
                        }}
                        title="Stock & price adjustment"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400
                                   hover:bg-amber-50 hover:text-amber-600 transition-colors"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onEdit(p)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400
                                   hover:bg-primary-50 hover:text-primary-600 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400
                                   hover:bg-red-50 hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      ) : (
        <div className="space-y-3">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicine Name</th>
                  <th>Category</th>
                  <th>Strength</th>
                  <th>Pack</th>
                  <th>Manufacturer</th>
                  <th>HSN</th>
                  <th>Stock</th>
                  <th>Availability</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {catalogLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400">
                      Loading medicines...
                    </td>
                  </tr>
                ) : catalogData.products.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400">
                      No medicines found
                    </td>
                  </tr>
                ) : (
                  catalogData.products.map((product, index) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="text-slate-400">
                        {(catalogPage - 1) * 50 + index + 1}
                      </td>
                      <td>
                        <p className="font-medium text-slate-800">{product.name}</p>
                        {product.isCatalog === 1 && (
                          <p className="text-[10px] text-blue-500 mt-0.5">Medicine catalog</p>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-info">{product.category || 'Others'}</span>
                      </td>
                      <td className="text-slate-500">{product.grams || '—'}</td>
                      <td className="text-slate-500">{product.packType || '—'}</td>
                      <td className="text-slate-500">{product.manufacturer || '—'}</td>
                      <td className="text-slate-500 font-mono text-xs">{product.hsn || '—'}</td>
                      <td className="font-semibold">{Number(product.stock) || 0}</td>
                      <td>
                        {Number(product.stock) > 0 ? (
                          <span className="badge badge-success">In Stock</span>
                        ) : (
                          <span className="badge badge-danger">No Stock</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          title="Add temporary stock"
                          onClick={() => {
                            setAdjustMode('add_stock');
                            setAdjustingProduct({
                              ...product,
                              batches: product.batches || [],
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          Add Stock
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {catalogPage.toLocaleString('en-IN')} of {catalogData.totalPages.toLocaleString('en-IN')}
              {' · '}{catalogData.total.toLocaleString('en-IN')} medicines
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCatalogPage(page => Math.max(1, page - 1))}
                disabled={catalogPage <= 1 || catalogLoading}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCatalogPage(page => Math.min(catalogData.totalPages, page + 1))}
                disabled={catalogPage >= catalogData.totalPages || catalogLoading}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Detail Popup ── */}
      {selectedProduct && (
        <ProductDetailPopup
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          invoices={state.invoices}
          purchaseInvoices={state.purchaseInvoices}
        />
      )}

      {/* ── Bulk Import Modal ── */}
      {isImportModalOpen && (
        <BulkImportModal
          onClose={() => {
            setImportModalOpen(false);
            refreshCatalogStats();
          }}
        />
      )}

      {adjustingProduct && (
        <InventoryAdjustmentModal
          product={adjustingProduct}
          mode={adjustMode}
          onClose={() => {
            setAdjustingProduct(null);
            setAdjustMode('adjust');
          }}
          onSaved={updated => {
            setAdjustingProduct(null);
            setAdjustMode('adjust');
            if (selectedProduct?.id === updated.id) setSelectedProduct(updated);
            refreshCatalogStats();
            if (viewMode === 'all') {
              setCatalogPage(page => page);
              setCatalogData(current => ({
                ...current,
                products: current.products.map(item =>
                  item.id === updated.id
                    ? { ...item, ...updated, isCatalog: 0, stock: updated.stock }
                    : item
                ),
              }));
            }
          }}
        />
      )}
    </div>
  );
}
