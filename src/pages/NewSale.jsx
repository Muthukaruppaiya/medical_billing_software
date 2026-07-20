import { useEffect, useMemo, useState } from 'react';
import SaleInvoice from '../components/billing/SaleInvoice';
import { ShoppingCart, Save, Coffee, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { nextDocumentNo } from '../hooks/useInvoice';
import dayjs from 'dayjs';
import { formatExpiry, isExpiryValid } from '../utils/expiry';

const isSellableBatch = batch =>
  Number(batch.stock) > 0 && isExpiryValid(batch.expiry);

const buildBulkRow = (product, existing) => {
  const firstBatch = (product.batches || []).find(isSellableBatch);
  if (existing) {
    const selected = product.batches?.find(batch => batch.id === Number(existing.batchId));
    const batch = selected && isSellableBatch(selected) ? selected : firstBatch;
    return {
      ...existing,
      product,
      batchId: batch?.id || '',
      batch: batch?.batch || '',
      expiry: batch?.expiry || '',
      maxStock: batch ? Number(batch.stock) : 0,
      qty: batch
        ? Math.min(Number(existing.qty) || 0, Number(batch.stock))
        : Number(existing.qty) || 0,
      rate: batch?.rate ?? existing.rate ?? product.rate,
    };
  }

  return {
    product,
    batchId: firstBatch?.id || '',
    batch: firstBatch?.batch || '',
    expiry: firstBatch?.expiry || '',
    maxStock: firstBatch ? Number(firstBatch.stock) : 0,
    qty: 0,
    rate: firstBatch?.rate ?? product.rate,
  };
};

export default function NewSale() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState('standard'); // 'standard' | 'bulk'
  
  // States for consolidated sales entry
  const [bulkDate, setBulkDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkDiscount, setBulkDiscount] = useState(0);
  const [bulkDiscountType, setBulkDiscountType] = useState('%');

  // Consolidated Items List
  const [bulkItems, setBulkItems] = useState([]); // Array of { product, qty, rate }
  
  // Search dropdown states
  const [prodQuery, setProdQuery] = useState('');
  const [showProdDD, setShowProdDD] = useState(false);

  // Products enabled for consolidated sale in Settings
  const consolidatedProducts = useMemo(
    () => state.products
      .filter(p => Number(p.consolidatedSaleEnabled) === 1)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [state.products]
  );

  const consolidatedProductKey = consolidatedProducts.map(p => p.id).join(',');

  // Reflect the Settings list on the daily entry screen
  useEffect(() => {
    if (activeTab !== 'bulk') return;
    setBulkItems(prev => {
      const byId = new Map(prev.map(item => [item.product.id, item]));
      return consolidatedProducts.map(product => buildBulkRow(product, byId.get(product.id)));
    });
  }, [activeTab, consolidatedProductKey, consolidatedProducts]);

  const prodResultsRaw = prodQuery.length > 0
    ? consolidatedProducts.filter(p =>
        p.name.toLowerCase().includes(prodQuery.toLowerCase()) ||
        (p.hsn || '').includes(prodQuery)
      )
    : [];

  const prodResults = prodResultsRaw
    .sort((a, b) => {
      const q = prodQuery.toLowerCase();
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 8);

  const addProductToBulk = (product) => {
    setBulkItems(prev => {
      if (prev.some(item => item.product.id === product.id)) return prev;
      return [...prev, buildBulkRow(product)];
    });
    setProdQuery('');
    setShowProdDD(false);
  };

  const updateBulkQty = (index, val) => {
    const updated = [...bulkItems];
    const requested = Math.max(0, Number(val) || 0);
    updated[index].qty = updated[index].maxStock
      ? Math.min(requested, updated[index].maxStock)
      : requested;
    setBulkItems(updated);
  };

  const updateBulkBatch = (index, batchId) => {
    const updated = [...bulkItems];
    const item = updated[index];
    const selected = item.product.batches?.find(batch => batch.id === Number(batchId));
    if (!selected) return;
    updated[index] = {
      ...item,
      batchId: selected.id,
      batch: selected.batch,
      expiry: selected.expiry,
      maxStock: Number(selected.stock),
      qty: Math.min(item.qty, Number(selected.stock)),
      rate: selected.rate ?? item.product.rate,
    };
    setBulkItems(updated);
  };

  const updateBulkRate = (index, val) => {
    const updated = [...bulkItems];
    updated[index].rate = Math.max(0, Number(val) || 0);
    setBulkItems(updated);
  };

  const removeBulkItem = (index) => {
    setBulkItems(prev => prev.filter((_, i) => i !== index));
  };

  // Grand total of the consolidated entry
  const soldItems = bulkItems.filter(item => Number(item.qty) > 0);
  const totalAmount = soldItems.reduce((sum, item) => sum + (item.qty * item.rate), 0);
  const bulkDiscountValue = Number(bulkDiscount) || 0;
  const bulkDiscountAmount = Math.min(
    totalAmount,
    bulkDiscountType === '%'
      ? (totalAmount * bulkDiscountValue) / 100
      : bulkDiscountValue
  );
  const finalBulkAmount = Math.max(0, totalAmount - bulkDiscountAmount);

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!soldItems.length) {
      alert('Enter quantity for at least one product');
      return;
    }
    const missingBatch = soldItems.find(item => !item.batchId);
    if (missingBatch) {
      alert(`Select a batch for ${missingBatch.product.name}`);
      return;
    }

    setSaving(true);
    try {
      const invNo = await nextDocumentNo('sale');
      const invoice = {
        id: invNo,
        date: dayjs(bulkDate).format('DD-MM-YYYY'),
        createdAt: Date.now(),
        customer: 'Bulk Small Sales Summary',
        amount: finalBulkAmount,
        tax: 0,
        status: 'Paid',
        type: 'sale',
        items: soldItems.map(item => ({
          product: { id: item.product.id, name: item.product.name },
          batchId: item.batchId,
          batch: item.batch,
          expiry: item.expiry,
          qty: item.qty,
          rate: item.rate,
          cgst: 0,
          sgst: 0,
          total: item.qty * item.rate
        })),
        gstin: '',
        discount: bulkDiscountAmount,
      };

      await dispatch({ type: 'ADD_INVOICE', payload: invoice });
      alert(`Consolidated Sales Entry of ₹${finalBulkAmount.toFixed(2)} saved successfully! (Inventory updated)`);
      setBulkItems(consolidatedProducts.map(product => buildBulkRow(product)));
      setRemarks('');
      setBulkDiscount(0);
      setBulkDiscountType('%');
    } catch (err) {
      console.error(err);
      alert('Failed to save consolidation');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Selector Tabs */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl w-fit border border-slate-200">
        <button
          onClick={() => setActiveTab('standard')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'standard'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Standard Bill
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'bulk'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Coffee className="w-4 h-4" />
          Consolidated Sale (Small Sales)
        </button>
      </div>

      {/* Render selected view */}
      {activeTab === 'standard' ? (
        <SaleInvoice />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Main items editor */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Consolidated Sales Entry</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Products from Settings appear here automatically. Enter today&apos;s sold quantities.
                </p>
              </div>

              {/* Product search */}
              <div className="relative">
                <label className="form-label">Search & Add Medicines Sold Today</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={prodQuery}
                    onChange={e => { setProdQuery(e.target.value); setShowProdDD(true); }}
                    onFocus={() => { if (prodQuery) setShowProdDD(true); }}
                    onBlur={() => setTimeout(() => setShowProdDD(false), 150)}
                    placeholder={
                      consolidatedProducts.length === 0
                        ? 'No products configured — add them in Settings'
                        : 'Type name or HSN code...'
                    }
                    disabled={consolidatedProducts.length === 0}
                    className="form-input pl-9 disabled:bg-slate-50 disabled:cursor-not-allowed"
                  />
                </div>
                {consolidatedProducts.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Configure the Consolidated Sale product list under Backup & Settings before recording daily sales.
                  </p>
                )}

                {showProdDD && prodResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl
                                  shadow-lg border border-surface-border overflow-hidden max-h-60 overflow-y-auto">
                    {prodResults.map(p => {
                      const q = prodQuery.toLowerCase();
                      const nameStarts = p.name.toLowerCase().startsWith(q);
                      const sellableStock = (p.batches || [])
                        .filter(isSellableBatch)
                        .reduce((sum, batch) => sum + Number(batch.stock || 0), 0);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => addProductToBulk(p)}
                          disabled={sellableStock === 0}
                          className="w-full flex items-center justify-between px-4 py-2 text-sm border-b border-surface-border last:border-0 hover:bg-primary-50 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <div>
                            <p className="font-medium text-slate-800">
                              {nameStarts ? (
                                <>
                                  <span className="text-primary-600 font-bold">{p.name.slice(0, prodQuery.length)}</span>
                                  <span>{p.name.slice(prodQuery.length)}</span>
                                </>
                              ) : (
                                p.name
                              )}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">Sellable stock: {sellableStock} {p.grams ? `· ${p.grams}` : ''}</p>
                          </div>
                          <span className="text-primary-600 font-semibold text-xs">₹{p.rate}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="table-wrapper border border-slate-100 rounded-xl">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Batch / Expiry</th>
                      <th>Qty Sold</th>
                      <th>Rate</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                          {consolidatedProducts.length === 0
                            ? 'No products configured. Select them under Backup & Settings → Consolidated Sale Products.'
                            : 'Loading product list...'}
                        </td>
                      </tr>
                    ) : (
                      bulkItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="text-xs font-medium text-slate-800">{item.product.name}</td>
                          <td className="min-w-48">
                            <select
                              value={item.batchId}
                              onChange={event => updateBulkBatch(idx, event.target.value)}
                              className="form-input text-xs py-1"
                              required
                            >
                              <option value="">Select batch</option>
                              {(item.product.batches || [])
                                .filter(isSellableBatch)
                                .map(batch => (
                                  <option key={batch.id} value={batch.id}>
                                    {batch.batch} · EXP {formatExpiry(batch.expiry)} · Stock {batch.stock}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="w-24">
                            <input
                              type="number"
                              min="0"
                              max={item.maxStock || undefined}
                              value={item.qty}
                              onChange={e => updateBulkQty(idx, e.target.value)}
                              className="form-input text-xs py-1"
                            />
                          </td>
                          <td className="w-24">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={e => updateBulkRate(idx, e.target.value)}
                              className="form-input text-xs py-1"
                            />
                          </td>
                          <td className="text-xs font-semibold text-slate-700">
                            ₹{(item.qty * item.rate).toFixed(2)}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => removeBulkItem(idx)}
                              className="text-slate-400 hover:text-danger p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar controls & saving */}
          <div className="space-y-4">
            <div className="card space-y-4">
              <div>
                <h3 className="font-semibold text-slate-700 text-sm">Save Consolidation</h3>
                <p className="text-xs text-slate-400">Review total value and record date.</p>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Subtotal:</span>
                  <span className="font-semibold text-slate-700">₹{totalAmount.toFixed(2)}</span>
                </div>
                {bulkDiscountAmount > 0 && (
                  <div className="flex justify-between items-center text-danger">
                    <span>
                      Discount ({bulkDiscountType === '%' ? `${bulkDiscountValue}%` : 'Fixed'}):
                    </span>
                    <span className="font-semibold">-₹{bulkDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="h-px bg-slate-200" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-semibold">Grand Total:</span>
                  <span className="text-xl font-bold text-primary-600">₹{finalBulkAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              <form onSubmit={handleBulkSubmit} className="space-y-4">
                <div>
                  <label className="form-label">Apply Discount</label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-surface-border overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => setBulkDiscountType('%')}
                        className={`px-3 text-xs font-bold transition-colors ${
                          bulkDiscountType === '%'
                            ? 'bg-primary-500 text-white'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkDiscountType('₹')}
                        className={`px-3 text-xs font-bold transition-colors ${
                          bulkDiscountType === '₹'
                            ? 'bg-primary-500 text-white'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        ₹
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={bulkDiscount || ''}
                      onChange={event => setBulkDiscount(Math.max(0, Number(event.target.value)))}
                      placeholder={bulkDiscountType === '%' ? 'e.g. 10' : 'e.g. 50'}
                      className="form-input text-sm flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Sale Date</label>
                  <input
                    type="date"
                    required
                    value={bulkDate}
                    onChange={e => setBulkDate(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label">Remarks / Description</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="e.g. Daily Consolidated OTC Sales"
                    className="form-input text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving || soldItems.length === 0}
                  className="btn-success w-full justify-center py-2.5 text-xs font-bold gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Consolidated Entry'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
