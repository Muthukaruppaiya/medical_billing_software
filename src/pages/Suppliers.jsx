import { useMemo, useState } from 'react';
import {
  Search, Plus, Phone, MapPin, FileText, Pencil, Trash2, Truck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import SupplierModal from '../components/suppliers/SupplierModal';

export default function Suppliers() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const suppliers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return state.suppliers.filter(supplier =>
      !normalizedQuery ||
      supplier.name.toLowerCase().includes(normalizedQuery) ||
      (supplier.phone || '').includes(normalizedQuery) ||
      (supplier.gstin || '').toLowerCase().includes(normalizedQuery)
    );
  }, [state.suppliers, query]);

  const openAdd = () => {
    setEditingSupplier(null);
    setModalOpen(true);
  };

  const openEdit = supplier => {
    setEditingSupplier(supplier);
    setModalOpen(true);
  };

  const saveSupplier = async form => {
    if (form.id) {
      await dispatch({ type: 'UPDATE_SUPPLIER', payload: form });
    } else {
      await dispatch({ type: 'ADD_SUPPLIER', payload: form });
    }
    setModalOpen(false);
    setEditingSupplier(null);
  };

  const deleteSupplier = async supplier => {
    const confirmed = window.confirm(
      `Delete supplier "${supplier.name}"?\n\nExisting purchase history will remain unchanged.`
    );
    if (!confirmed) return;

    setDeletingId(supplier.id);
    try {
      await dispatch({ type: 'DELETE_SUPPLIER', payload: supplier.id });
    } catch (error) {
      alert(error.message || 'Failed to delete supplier');
    } finally {
      setDeletingId(null);
    }
  };

  const purchaseSummary = supplier => {
    const purchases = state.purchaseInvoices.filter(
      purchase =>
        (purchase.supplierId &&
          Number(purchase.supplierId) === Number(supplier.id)) ||
        (!purchase.supplierId && purchase.supplier === supplier.name)
    );
    return {
      count: purchases.length,
      amount: purchases.reduce(
        (sum, purchase) => sum + Number(purchase.amount || 0),
        0
      ),
    };
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">
            {state.suppliers.length} suppliers maintained
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by name, phone, or GSTIN..."
          className="form-input pl-9"
        />
      </div>

      {suppliers.length === 0 ? (
        <div className="card py-14 text-center">
          <Truck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No suppliers found.</p>
          <button onClick={openAdd} className="btn-primary mt-4 mx-auto">
            <Plus className="w-4 h-4" />
            Add First Supplier
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map(supplier => {
            const summary = purchaseSummary(supplier);
            return (
              <div key={supplier.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 truncate">
                        {supplier.name}
                      </h3>
                      {supplier.gstin && (
                        <p className="text-xs text-primary-500 font-mono truncate">
                          {supplier.gstin}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(supplier)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                      title="Edit supplier"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSupplier(supplier)}
                      disabled={deletingId === supplier.id}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-danger disabled:opacity-50"
                      title="Delete supplier"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mt-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{supplier.phone || 'No phone provided'}</span>
                  </div>
                  {supplier.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <span className="text-xs line-clamp-2">{supplier.address}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-[11px] text-slate-400">Purchase Orders</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {summary.count}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Total Purchased</p>
                    <p className="text-sm font-bold text-teal-600">
                      ₹{summary.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <SupplierModal
          supplier={editingSupplier}
          onSave={saveSupplier}
          onClose={() => {
            setModalOpen(false);
            setEditingSupplier(null);
          }}
        />
      )}
    </div>
  );
}
