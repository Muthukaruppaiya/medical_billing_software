import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, History, PackagePlus, RefreshCw, Save, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ExpiryInput from '../ui/ExpiryInput';
import { normalizeExpiry } from '../../utils/expiry';

const typeOptions = [
  { value: 'increase', label: 'Increase Stock', icon: ArrowUp, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'decrease', label: 'Decrease Stock', icon: ArrowDown, color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'set', label: 'Set Exact Stock', icon: RefreshCw, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'price', label: 'Price Only', icon: SlidersHorizontal, color: 'text-violet-600 bg-violet-50 border-violet-200' },
];

const fmt = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function InventoryAdjustmentModal({ product, onClose, onSaved, mode = 'adjust' }) {
  const { dispatch } = useApp();
  const batches = useMemo(() => product.batches || [], [product.batches]);
  const isAddStockMode = mode === 'add_stock' || Number(product.isCatalog) === 1 || batches.length === 0;

  const [batchId, setBatchId] = useState(batches[0]?.id || '');
  const [createNewBatch, setCreateNewBatch] = useState(isAddStockMode);
  const [newBatch, setNewBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [adjustmentType, setAdjustmentType] = useState(isAddStockMode ? 'add_stock' : 'increase');
  const [quantity, setQuantity] = useState(isAddStockMode ? '1' : '');
  const [purchaseRate, setPurchaseRate] = useState(product.purchaseRate ?? 0);
  const [saleRate, setSaleRate] = useState(product.rate ?? 0);
  const [mrp, setMrp] = useState(product.mrp ?? 0);
  const [reason, setReason] = useState(isAddStockMode ? 'Temporary manual stock entry' : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const selectedBatch = batches.find(batch => batch.id === Number(batchId));

  useEffect(() => {
    if (!selectedBatch || createNewBatch) return;
    setPurchaseRate(selectedBatch.purchaseRate ?? selectedBatch.rate ?? 0);
    setSaleRate(selectedBatch.rate ?? 0);
    setMrp(selectedBatch.mrp ?? 0);
    setExpiry(selectedBatch.expiry || '');
    if (!isAddStockMode) setQuantity('');
  }, [selectedBatch, createNewBatch, isAddStockMode]);

  useEffect(() => {
    fetch(`/api/products/${product.id}/adjustments`)
      .then(response => response.json())
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  }, [product.id]);

  const submit = async event => {
    event.preventDefault();
    if (!createNewBatch && !batchId) return setError('Select a batch');
    if (createNewBatch && !String(newBatch).trim()) {
      return setError('Enter a batch number for the temporary stock');
    }
    if (!reason.trim()) return setError('Enter a reason for the adjustment');
    if (adjustmentType !== 'price' && quantity === '') {
      return setError('Enter the stock quantity');
    }
    if (adjustmentType !== 'price' && Number(quantity) <= 0 && adjustmentType !== 'set') {
      return setError('Quantity must be greater than zero');
    }

    setSaving(true);
    setError('');
    try {
      const batchNumber = String(newBatch).trim() || (selectedBatch?.batch || '');
      const payload = {
        productId: product.id,
        adjustmentType: (createNewBatch || isAddStockMode) ? 'add_stock' : adjustmentType,
        quantity: Number(quantity) || 0,
        purchaseRate: Number(purchaseRate) || 0,
        saleRate: Number(saleRate) || 0,
        mrp: Number(mrp) || 0,
        reason: reason.trim(),
        createNewBatch: Boolean(createNewBatch || isAddStockMode),
        batch: batchNumber,
        expiry: normalizeExpiry(expiry) || '',
      };
      // Only send batchId when adjusting an existing selected batch (not free-text add stock).
      if (!payload.createNewBatch && batchId) {
        payload.batchId = Number(batchId);
      }

      const updated = await dispatch({
        type: 'ADJUST_INVENTORY',
        payload,
      });
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save inventory adjustment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-fade-in">
        <div className="flex items-start justify-between px-6 py-4 border-b border-surface-border">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isAddStockMode ? 'Add Temporary Stock' : 'Stock & Price Adjustment'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{product.name}</p>
            {isAddStockMode && (
              <p className="text-[11px] text-amber-600 mt-1">
                Catalog medicine — enter batch + quantity to move it into stock inventory.
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <form id="inventory-adjustment-form" onSubmit={submit} className="p-6 space-y-5">
            {!isAddStockMode && batches.length > 0 && (
              <div>
                <label className="form-label">Batch</label>
                <div className="space-y-2">
                  <select
                    value={createNewBatch ? 'new' : batchId}
                    onChange={event => {
                      if (event.target.value === 'new') {
                        setCreateNewBatch(true);
                        setAdjustmentType('add_stock');
                      } else {
                        setCreateNewBatch(false);
                        setBatchId(event.target.value);
                        setAdjustmentType('increase');
                      }
                    }}
                    className="form-input"
                    required
                  >
                    {batches.map(batch => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch} · Stock {batch.stock} · Exp {batch.expiry || 'N/A'}
                      </option>
                    ))}
                    <option value="new">+ Create new batch / temporary stock</option>
                  </select>
                </div>
              </div>
            )}

            {(createNewBatch || isAddStockMode) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold">
                  <PackagePlus className="w-4 h-4" />
                  Temporary / New Batch Details
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Batch Number *</label>
                    <input
                      value={newBatch}
                      onChange={event => setNewBatch(event.target.value)}
                      className="form-input"
                      placeholder="e.g. TEMP01 / MANUAL01"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">EXP (MM/YY)</label>
                    <ExpiryInput
                      value={expiry}
                      onChange={setExpiry}
                    />
                  </div>
                </div>
              </div>
            )}

            {!createNewBatch && selectedBatch && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Current Stock', selectedBatch.stock],
                  ['Purchase Rate', fmt(selectedBatch.purchaseRate ?? selectedBatch.rate)],
                  ['Sale Rate', fmt(selectedBatch.rate)],
                  ['MRP', fmt(selectedBatch.mrp)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {!isAddStockMode && !createNewBatch && (
              <div>
                <label className="form-label">Adjustment Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {typeOptions.map(option => {
                    const Icon = option.icon;
                    const active = adjustmentType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setAdjustmentType(option.value);
                          setError('');
                        }}
                        className={`rounded-xl border px-3 py-3 text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                          active ? option.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {adjustmentType !== 'price' && (
              <div>
                <label className="form-label">
                  {adjustmentType === 'set' ? 'New Exact Stock' : 'Stock Quantity *'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={event => setQuantity(event.target.value)}
                  className="form-input"
                  placeholder={adjustmentType === 'set' ? 'Enter final stock quantity' : 'Enter quantity to add'}
                  required
                />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-3">
                <SlidersHorizontal className="w-4 h-4 text-primary-500" />
                <h3 className="text-sm font-semibold text-slate-700">Price</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Purchase Rate</label>
                  <input type="number" min="0" step="0.01" value={purchaseRate}
                    onChange={event => setPurchaseRate(event.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Sale Rate</label>
                  <input type="number" min="0" step="0.01" value={saleRate}
                    onChange={event => setSaleRate(event.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">MRP</label>
                  <input type="number" min="0" step="0.01" value={mrp}
                    onChange={event => setMrp(event.target.value)} className="form-input" />
                </div>
              </div>
            </div>

            <div>
              <label className="form-label">Reason *</label>
              <input
                value={reason}
                onChange={event => setReason(event.target.value)}
                className="form-input"
                placeholder="e.g. Temporary stock, physical count, damaged"
                list="adjustment-reasons"
                required
              />
              <datalist id="adjustment-reasons">
                <option value="Temporary manual stock entry" />
                <option value="Physical stock count correction" />
                <option value="Damaged stock" />
                <option value="Expired stock" />
                <option value="Free / bonus stock" />
                <option value="Purchase return" />
                <option value="Price revision" />
              </datalist>
            </div>

            {error && <div className="rounded-lg bg-red-50 text-danger text-sm px-3 py-2">{error}</div>}

            {history.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <History className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs font-semibold text-slate-700">Recent Adjustments</h3>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {history.slice(0, 10).map(item => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 text-xs">
                      <div>
                        <p className="font-medium text-slate-700">{item.reason}</p>
                        <p className="text-slate-400 mt-0.5">
                          {item.batch} · {new Date(item.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-700">{item.stockBefore} → {item.stockAfter}</p>
                        <p className="text-slate-400 capitalize">{item.adjustmentType}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-border bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
          <button
            type="submit"
            form="inventory-adjustment-form"
            disabled={saving}
            className="btn-success disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : isAddStockMode ? 'Add Stock' : 'Save Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}
