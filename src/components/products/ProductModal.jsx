import { useState, useEffect } from 'react';
import {
  X, Save, Package, MapPin, FlaskConical, IndianRupee, Plus, Trash2,
} from 'lucide-react';
import ExpiryInput from '../ui/ExpiryInput';
import { normalizeExpiry } from '../../utils/expiry';

const CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Liquid', 'Injection', 'Inhaler', 'Ointment', 'Others'];
const PACK_TYPES = ['Strip', 'Bottle', 'Box', 'Vial', 'Tube', 'Sachet', 'Ampoule', 'Others'];

const empty = {
  name: '', hsn: '', category: 'Tablet', manufacturer: '',
  mrp: '', rate: '', cgst: 6, sgst: 6,
  stock: '', minStock: '', batch: '', expiry: '',
  grams: '', packType: 'Strip',
  boxNo: '', rackLocation: '',
};

const newBatchRow = () => ({
  batch: '',
  expiry: '',
  stock: '',
  mrp: '',
  rate: '',
});

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
        <Icon className="w-4 h-4 text-primary-500" />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  );
}

export default function ProductModal({ product, onSave, onClose }) {
  const [form, setForm] = useState(empty);
  const [batchRows, setBatchRows] = useState([newBatchRow()]);
  const hasMultipleBatches = (product?.batches?.length || 0) > 1;

  useEffect(() => {
    setForm(product ? { ...empty, ...product } : empty);
    setBatchRows(
      product?.batches?.length
        ? product.batches.map(batch => ({ ...newBatchRow(), ...batch }))
        : [newBatchRow()]
    );
  }, [product]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setBatch = (index, field, value) => {
    setBatchRows(rows =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };
  const addBatch = () => setBatchRows(rows => [...rows, newBatchRow()]);
  const removeBatch = index => {
    setBatchRows(rows => rows.length === 1 ? rows : rows.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.hsn) return alert('Name and HSN Code are required');

    if (!product) {
      const incompleteBatch = batchRows.find(
        row => !row.batch.trim() || row.rate === '' || row.stock === ''
      );
      if (incompleteBatch) {
        return alert('Batch number, purchase rate, and stock are required for every batch');
      }
      const duplicateNames = new Set();
      for (const row of batchRows) {
        const key = row.batch.trim().toLowerCase();
        if (duplicateNames.has(key)) return alert(`Duplicate batch number: ${row.batch}`);
        duplicateNames.add(key);
      }

      const normalizedBatches = batchRows.map(row => ({
        batch: row.batch.trim(),
        expiry: normalizeExpiry(row.expiry) || '',
        stock: Number(row.stock),
        mrp: Number(row.mrp),
        rate: Number(row.rate),
        cgst: Number(form.cgst),
        sgst: Number(form.sgst),
      }));
      const firstBatch = normalizedBatches[0];
      onSave({
        ...form,
        ...firstBatch,
        batches: normalizedBatches,
        stock: normalizedBatches.reduce((sum, row) => sum + row.stock, 0),
        minStock: Number(form.minStock),
      });
      return;
    }

    if (!form.rate) return alert('Purchase Rate is required');
    onSave({
      ...form,
      expiry: normalizeExpiry(form.expiry) || '',
      mrp: Number(form.mrp),
      rate: Number(form.rate),
      cgst: Number(form.cgst),
      sgst: Number(form.sgst),
      stock: Number(form.stock),
      minStock: Number(form.minStock),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl animate-fade-in overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {product ? 'Edit Product' : 'Add New Product'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Fill all details for accurate inventory tracking</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Section 1: Basic Info ── */}
          <Section icon={Package} title="Product Information">
            <div className="col-span-2">
              <label className="form-label">Product / Medicine Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                     className="form-input" placeholder="e.g. Paracetamol 500mg" required />
            </div>

            <div>
              <label className="form-label">HSN Code *</label>
              <input value={form.hsn} onChange={e => set('hsn', e.target.value)}
                     className="form-input" placeholder="30049099" required />
            </div>

            <div>
              <label className="form-label">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className="form-select">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Manufacturer</label>
              <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                     className="form-input" placeholder="Cipla, Sun Pharma..." />
            </div>

            {product && (
              <div>
                <label className="form-label">Batch No.</label>
                <input value={form.batch} onChange={e => set('batch', e.target.value)}
                       className="form-input" placeholder="B001" disabled={hasMultipleBatches} />
              </div>
            )}

            <div>
              <label className="form-label">Pack Type</label>
              <select value={form.packType} onChange={e => set('packType', e.target.value)} className="form-select">
                {PACK_TYPES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Weight / Grams (gm / ml)</label>
              <input value={form.grams} onChange={e => set('grams', e.target.value)}
                     className="form-input" placeholder="e.g. 500mg, 200ml, 30gm" />
            </div>

            {product && (
              <div>
                <label className="form-label">EXP (MM/YY)</label>
                <ExpiryInput
                  value={form.expiry}
                  onChange={value => set('expiry', value)}
                  disabled={hasMultipleBatches}
                />
              </div>
            )}
          </Section>

          {/* ── Section 2: Pricing & Tax ── */}
          <Section icon={IndianRupee} title="Pricing & Tax">
            {product && (
              <>
                <div>
                  <label className="form-label">MRP (₹)</label>
                  <input type="number" value={form.mrp} onChange={e => set('mrp', e.target.value)}
                         className="form-input" placeholder="0.00" step="0.01" />
                </div>

                <div>
                  <label className="form-label">Purchase Rate (₹) *</label>
                  <input type="number" value={form.rate} onChange={e => set('rate', e.target.value)}
                         className="form-input" placeholder="0.00" step="0.01" required />
                </div>
              </>
            )}

            <div>
              <label className="form-label">CGST %</label>
              <input type="number" value={form.cgst} onChange={e => set('cgst', e.target.value)}
                     className="form-input" step="0.5" />
            </div>

            <div>
              <label className="form-label">SGST %</label>
              <input type="number" value={form.sgst} onChange={e => set('sgst', e.target.value)}
                     className="form-input" step="0.5" />
            </div>
          </Section>

          {!product && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Batch Inventory
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={addBatch}
                  className="btn-secondary text-xs py-1.5 px-3 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Batch
                </button>
              </div>

              <div className="space-y-3">
                {batchRows.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end p-3 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <div className="md:col-span-1">
                      <label className="form-label text-[11px]">Batch No. *</label>
                      <input
                        value={row.batch}
                        onChange={event => setBatch(index, 'batch', event.target.value)}
                        className="form-input text-sm"
                        placeholder="B001"
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label text-[11px]">EXP (MM/YY)</label>
                      <ExpiryInput
                        value={row.expiry}
                        onChange={value => setBatch(index, 'expiry', value)}
                        className="form-input text-sm"
                      />
                    </div>
                    <div>
                      <label className="form-label text-[11px]">Stock *</label>
                      <input
                        type="number"
                        min="0"
                        value={row.stock}
                        onChange={event => setBatch(index, 'stock', event.target.value)}
                        className="form-input text-sm"
                        placeholder="0"
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label text-[11px]">MRP</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.mrp}
                        onChange={event => setBatch(index, 'mrp', event.target.value)}
                        className="form-input text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="form-label text-[11px]">Purchase Rate *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.rate}
                        onChange={event => setBatch(index, 'rate', event.target.value)}
                        className="form-input text-sm"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBatch(index)}
                      disabled={batchRows.length === 1}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-danger disabled:opacity-30"
                      title="Remove batch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 3: Stock Info ── */}
          <Section icon={FlaskConical} title="Stock & Inventory">
            {product && (
              <div>
                <label className="form-label">Current Stock (qty)</label>
                <input type="number" value={form.stock} onChange={e => set('stock', e.target.value)}
                       className="form-input" placeholder="0" disabled={hasMultipleBatches} />
              </div>
            )}

            <div>
              <label className="form-label">Min. Stock (Reorder Level)</label>
              <input type="number" value={form.minStock} onChange={e => set('minStock', e.target.value)}
                     className="form-input" placeholder="10" />
            </div>
          </Section>
          {hasMultipleBatches && (
            <p className="text-xs text-amber-600 -mt-3">
              This product has multiple batches. Batch numbers, expiry dates, and stock are maintained through purchase entries.
            </p>
          )}

          {/* ── Section 4: Storage Location ── */}
          <Section icon={MapPin} title="Storage Location">
            <div>
              <label className="form-label">Box No.</label>
              <input value={form.boxNo} onChange={e => set('boxNo', e.target.value)}
                     className="form-input" placeholder="e.g. BOX-12, A-04" />
            </div>

            <div>
              <label className="form-label">Rack Location</label>
              <input value={form.rackLocation} onChange={e => set('rackLocation', e.target.value)}
                     className="form-input" placeholder="e.g. Rack-3, Shelf B" />
            </div>
          </Section>

          {/* Footer */}
          <div className="flex gap-3 pt-2 border-t border-surface-border">
            <button type="submit" className="btn-success flex-1 justify-center">
              <Save className="w-4 h-4" />
              {product ? 'Update Product' : 'Add Product'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
