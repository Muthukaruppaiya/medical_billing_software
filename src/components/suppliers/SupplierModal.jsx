import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const emptySupplier = {
  name: '',
  phone: '',
  gstin: '',
  address: '',
};

export default function SupplierModal({ supplier, onSave, onClose }) {
  const [form, setForm] = useState(emptySupplier);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(supplier ? { ...emptySupplier, ...supplier } : emptySupplier);
  }, [supplier]);

  const set = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!form.name.trim()) return alert('Supplier name is required');

    setSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        address: form.address.trim(),
      });
    } catch (error) {
      alert(error.message || 'Failed to save supplier');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {supplier ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Maintain distributor contact and tax details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="form-label">Supplier Name *</label>
            <input
              value={form.name}
              onChange={event => set('name', event.target.value)}
              className="form-input"
              placeholder="Distributor / supplier name"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="form-label">Phone Number</label>
            <input
              value={form.phone}
              onChange={event => set('phone', event.target.value)}
              className="form-input"
              placeholder="Contact number"
            />
          </div>
          <div>
            <label className="form-label">GSTIN</label>
            <input
              value={form.gstin}
              onChange={event => set('gstin', event.target.value.toUpperCase())}
              className="form-input uppercase font-mono"
              placeholder="27AABCX1234X1Z5"
            />
          </div>
          <div>
            <label className="form-label">Address</label>
            <textarea
              value={form.address}
              onChange={event => set('address', event.target.value)}
              className="form-input"
              rows={3}
              placeholder="Full supplier address"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-success flex-1 justify-center disabled:opacity-50"
            >
              {saving ? 'Saving...' : supplier ? 'Update Supplier' : 'Save Supplier'}
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
