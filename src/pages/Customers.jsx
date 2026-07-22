import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, Phone, Mail, MapPin } from 'lucide-react';
import AddCustomerModal from '../components/customers/AddCustomerModal';
import { getCustomerDue } from '../utils/money';

export default function Customers() {
  const { state, dispatch } = useApp();
  const [query, setQuery]   = useState('');
  const [modal, setModal]   = useState(false);

  const customers = state.customers.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.phone.includes(query) ||
    (c.email || '').toLowerCase().includes(query.toLowerCase())
  );

  const duesById = useMemo(() => {
    const map = {};
    for (const c of state.customers) {
      map[c.id] = getCustomerDue(state.invoices, c);
    }
    return map;
  }, [state.customers, state.invoices]);

  const handleSave = (form) => {
    dispatch({ type: 'ADD_CUSTOMER', payload: form });
    setModal(false);
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">{state.customers.length} registered · amount tracking</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, phone, or email..."
          className="form-input pl-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {customers.map(c => {
          const due = duesById[c.id] || 0;
          return (
            <div key={c.id} className="card hover:shadow-card-hover transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600
                                flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                  {c.gstin && <p className="text-xs text-primary-500 font-mono">{c.gstin}</p>}
                </div>
                <div className={`text-right shrink-0 ${due > 0 ? 'text-danger' : 'text-success'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Due</p>
                  <p className="text-sm font-extrabold">
                    ₹{due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>{c.phone}</span>
                </div>
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-500 line-clamp-2">{c.address}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <AddCustomerModal onSave={handleSave} onClose={() => setModal(false)} />
      )}
    </div>
  );
}
