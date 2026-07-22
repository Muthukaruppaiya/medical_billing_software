import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const emptySupplier = {
  name: '',
  phone: '',
  gstin: '',
  pan: '',
  address: '',
  drugLicense: '',
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export default function SupplierModal({ supplier, onSave, onClose }) {
  const [form, setForm] = useState(emptySupplier);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(supplier ? { ...emptySupplier, ...supplier } : emptySupplier);
  }, [supplier]);

  const set = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleGstinChange = value => {
    const gstin = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    setForm(current => ({
      ...current,
      gstin,
      pan: gstin.length >= 12 ? gstin.slice(2, 12) : current.pan,
    }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.trim();
    const gstin = form.gstin.trim().toUpperCase();
    const pan = form.pan.trim().toUpperCase();
    const address = form.address.trim();
    const drugLicense = form.drugLicense.trim();

    if (!name) return alert('Supplier name is required');
    if (!address) return alert('Full address is mandatory');
    if (!phone) return alert('Phone number is mandatory');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return alert('Enter a valid phone number (at least 10 digits)');
    if (!gstin) return alert('GST number is mandatory');
    if (!GSTIN_RE.test(gstin)) return alert('Enter a valid 15-character GSTIN');
    if (!pan) return alert('PAN number is mandatory');
    if (!PAN_RE.test(pan)) return alert('Enter a valid PAN (e.g. ABCDE1234F)');
    if (gstin.slice(2, 12) !== pan) {
      return alert('PAN must match GSTIN (characters 3–12 of the GSTIN)');
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        name,
        phone,
        gstin,
        pan,
        address,
        drugLicense,
      });
    } catch (error) {
      alert(error.message || 'Failed to save supplier');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {supplier ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Name, full address, phone, GSTIN and PAN are mandatory
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
            <label className="form-label">Full Address *</label>
            <textarea
              value={form.address}
              onChange={event => set('address', event.target.value)}
              className="form-input"
              rows={3}
              placeholder="Complete billing address"
              required
            />
          </div>

          <div>
            <label className="form-label">Phone Number *</label>
            <input
              value={form.phone}
              onChange={event => set('phone', event.target.value)}
              className="form-input"
              placeholder="10-digit mobile / landline"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">GST Number *</label>
              <input
                value={form.gstin}
                onChange={event => handleGstinChange(event.target.value)}
                className="form-input uppercase font-mono"
                placeholder="27AABCX1234X1Z5"
                maxLength={15}
                required
              />
            </div>
            <div>
              <label className="form-label">PAN Number *</label>
              <input
                value={form.pan}
                onChange={event => set('pan', event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                className="form-input uppercase font-mono"
                placeholder="AABCX1234X"
                maxLength={10}
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">Auto-filled from GSTIN when possible</p>
            </div>
          </div>

          <div>
            <label className="form-label">DL Number (Drug License)</label>
            <input
              value={form.drugLicense}
              onChange={event => set('drugLicense', event.target.value)}
              className="form-input"
              placeholder="e.g. 2950/MDU/20B, TN/MDS/20/01981"
            />
            <p className="text-[10px] text-slate-400 mt-1">Optional — enter one or more drug license numbers</p>
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
