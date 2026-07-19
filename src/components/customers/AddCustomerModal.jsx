import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function AddCustomerModal({ onSave, onClose, initialPhone = '' }) {
  const [form, setForm] = useState({ name: '', phone: initialPhone, email: '', address: '', gstin: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (initialPhone) {
      setForm(f => ({ ...f, phone: initialPhone }));
    }
  }, [initialPhone]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return alert('Name and Phone are required');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-800">Add New Customer</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="form-label">Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
                   className="form-input" placeholder="Customer Name" required autoFocus />
          </div>
          <div>
            <label className="form-label">Phone *</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
                   className="form-input" placeholder="10-digit mobile" required />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                   className="form-input" placeholder="email@example.com" />
          </div>
          <div>
            <label className="form-label">Address</label>
            <textarea value={form.address} onChange={e => set('address', e.target.value)}
                      className="form-input" rows={2} placeholder="Full address" />
          </div>
          <div>
            <label className="form-label">GSTIN (optional)</label>
            <input value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())}
                   className="form-input uppercase" placeholder="27AABCX1234X1Z5" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-success flex-1 justify-center">Save Customer</button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
