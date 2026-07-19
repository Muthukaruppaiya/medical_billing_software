import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Save, Building2, FileText, Shield, Package, Search, X,
  ChevronRight, Phone, Mail, MapPin, HardDrive, Percent,
} from 'lucide-react';

function SettingsModal({ title, subtitle, icon: Icon, wide, onClose, children, footer }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col animate-fade-in`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-surface-border bg-slate-50/80 rounded-b-2xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingTile({ icon: Icon, title, description, meta, accent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card text-left w-full group hover:border-primary-200 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${accent}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800 group-hover:text-primary-700 transition-colors">
              {title}
            </h3>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 transition-colors shrink-0" />
          </div>
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{description}</p>
          {meta && (
            <p className="text-xs font-medium text-primary-600 mt-3 truncate">{meta}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Settings() {
  const { state, dispatch } = useApp();
  const [activeModal, setActiveModal] = useState(null);
  const [form, setForm] = useState({ ...state.company });
  const [companySaving, setCompanySaving] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [listSaved, setListSaved] = useState(false);
  const [listSaving, setListSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [taxForm, setTaxForm] = useState({ cgst: 6, sgst: 6, igst: 12 });
  const [taxSaved, setTaxSaved] = useState(false);

  useEffect(() => {
    setForm({ ...state.company });
  }, [state.company]);

  useEffect(() => {
    setSelectedIds(
      state.products
        .filter(product => Number(product.consolidatedSaleEnabled) === 1)
        .map(product => product.id)
    );
  }, [state.products]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openModal = (id) => {
    setActiveModal(id);
    setCompanySaved(false);
    setListSaved(false);
    setListError('');
    setTaxSaved(false);
    if (id === 'products') setListQuery('');
  };

  const closeModal = () => setActiveModal(null);

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    setCompanySaving(true);
    try {
      await dispatch({ type: 'UPDATE_COMPANY', payload: form });
      setCompanySaved(true);
      setTimeout(() => {
        setCompanySaved(false);
        closeModal();
      }, 900);
    } catch (err) {
      alert(err.message || 'Failed to save company settings');
    } finally {
      setCompanySaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    const sorted = [...state.products].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(product =>
      product.name.toLowerCase().includes(q) ||
      (product.hsn || '').toLowerCase().includes(q)
    );
  }, [state.products, listQuery]);

  const selectedNames = useMemo(() => {
    const selected = new Set(selectedIds);
    return state.products
      .filter(p => selected.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.products, selectedIds]);

  const toggleProduct = (productId) => {
    setSelectedIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
    setListError('');
  };

  const handleSaveList = async () => {
    setListSaving(true);
    setListError('');
    try {
      await dispatch({
        type: 'UPDATE_CONSOLIDATED_SALE_PRODUCTS',
        payload: selectedIds,
      });
      setListSaved(true);
      setTimeout(() => {
        setListSaved(false);
        closeModal();
      }, 900);
    } catch (err) {
      setListError(err.message || 'Failed to save consolidated sale product list');
    } finally {
      setListSaving(false);
    }
  };

  const handleBackup = async () => {
    setBackupRunning(true);
    setBackupStatus({ type: 'info', msg: 'Backing up...' });
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      if (data.errors && data.errors.length > 0 && data.success.length === 0) {
        setBackupStatus({ type: 'error', msg: 'Backup failed: ' + data.errors[0] });
      } else {
        setBackupStatus({
          type: 'success',
          msg: `Backup successful to ${data.success.length} location${data.success.length === 1 ? '' : 's'}!`,
        });
      }
    } catch {
      setBackupStatus({ type: 'error', msg: 'Failed to contact server' });
    } finally {
      setBackupRunning(false);
      setTimeout(() => setBackupStatus(null), 5000);
    }
  };

  const handleSaveTax = (e) => {
    e.preventDefault();
    setTaxSaved(true);
    setTimeout(() => {
      setTaxSaved(false);
      closeModal();
    }, 900);
  };

  const company = state.company || {};

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup & Settings</h1>
          <p className="page-subtitle">Quick access to company, sales list, backup, and tax defaults</p>
        </div>
      </div>

      {/* Snapshot strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-surface-border bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Pharmacy</p>
          <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{company.name || '—'}</p>
        </div>
        <div className="rounded-xl border border-surface-border bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Consolidated List</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">
            {selectedIds.length} product{selectedIds.length === 1 ? '' : 's'} selected
          </p>
        </div>
        <div className="rounded-xl border border-surface-border bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Default Tax</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">
            CGST {taxForm.cgst}% · SGST {taxForm.sgst}%
          </p>
        </div>
      </div>

      {/* Action tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SettingTile
          icon={Building2}
          accent="bg-sky-50 text-sky-600"
          title="Company Profile"
          description="Pharmacy name, address, GSTIN, drug license, and state details."
          meta={company.gstin ? `GSTIN ${company.gstin}` : 'Add tax & license details'}
          onClick={() => openModal('company')}
        />
        <SettingTile
          icon={Package}
          accent="bg-emerald-50 text-emerald-600"
          title="Consolidated Sale Products"
          description="Choose which products appear on the daily consolidated sale entry screen."
          meta={
            selectedIds.length
              ? `${selectedIds.length} selected · click to manage list`
              : 'No products selected yet'
          }
          onClick={() => openModal('products')}
        />
        <SettingTile
          icon={HardDrive}
          accent="bg-amber-50 text-amber-600"
          title="Database Backup"
          description="Create an instant backup of your complete database to configured folders."
          meta={backupStatus?.msg || 'Run backup when needed'}
          onClick={() => openModal('backup')}
        />
        <SettingTile
          icon={Percent}
          accent="bg-violet-50 text-violet-600"
          title="Default Tax Rates"
          description="Default CGST, SGST, and IGST used when adding new products."
          meta={`${taxForm.cgst}% / ${taxForm.sgst}% / ${taxForm.igst}%`}
          onClick={() => openModal('tax')}
        />
      </div>

      {/* Company modal */}
      {activeModal === 'company' && (
        <SettingsModal
          title="Company Profile"
          subtitle="Update pharmacy identity shown on bills and reports"
          icon={Building2}
          onClose={closeModal}
          footer={(
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={closeModal} className="btn-secondary text-sm">
                Cancel
              </button>
              <div className="flex items-center gap-3">
                {companySaved && (
                  <span className="text-sm text-success font-medium">✓ Saved</span>
                )}
                <button
                  type="submit"
                  form="company-settings-form"
                  disabled={companySaving}
                  className="btn-success disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {companySaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          )}
        >
          <form id="company-settings-form" onSubmit={handleSaveCompany} className="space-y-4">
            <div>
              <label className="form-label">Pharmacy / Company Name</label>
              <input
                value={form.name || ''}
                onChange={e => set('name', e.target.value)}
                className="form-input text-base font-medium"
              />
            </div>
            <div>
              <label className="form-label">Address</label>
              <textarea
                value={form.address || ''}
                onChange={e => set('address', e.target.value)}
                className="form-input"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone
                </label>
                <input
                  value={form.phone || ''}
                  onChange={e => set('phone', e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Email
                </label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={e => set('email', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="h-px bg-surface-border" />

            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary-500" />
              <h3 className="font-semibold text-slate-700 text-sm">Tax & License</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">GSTIN</label>
                <input
                  value={form.gstin || ''}
                  onChange={e => set('gstin', e.target.value.toUpperCase())}
                  className="form-input font-mono uppercase"
                />
              </div>
              <div>
                <label className="form-label">Drug License No.</label>
                <input
                  value={form.drugLicense || ''}
                  onChange={e => set('drugLicense', e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> State
                </label>
                <input
                  value={form.state || ''}
                  onChange={e => set('state', e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">State Code</label>
                <input
                  value={form.stateCode || ''}
                  onChange={e => set('stateCode', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
          </form>
        </SettingsModal>
      )}

      {/* Consolidated products modal */}
      {activeModal === 'products' && (
        <SettingsModal
          title="Consolidated Sale Products"
          subtitle="These products appear automatically on the daily entry screen"
          icon={Package}
          wide
          onClose={closeModal}
          footer={(
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={closeModal} className="btn-secondary text-sm">
                Cancel
              </button>
              <div className="flex items-center gap-3">
                {listError && <span className="text-sm text-danger font-medium">{listError}</span>}
                {listSaved && <span className="text-sm text-success font-medium">✓ Saved</span>}
                <button
                  type="button"
                  onClick={handleSaveList}
                  disabled={listSaving}
                  className="btn-success disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {listSaving ? 'Saving...' : 'Save Product List'}
                </button>
              </div>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                Tick products for daily wholesale / consolidated sales.
              </p>
              <span className="text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full">
                {selectedIds.length} selected
              </span>
            </div>

            {selectedNames.length > 0 && (
              <div className="rounded-xl bg-slate-50 border border-surface-border px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
                  Currently selected
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNames.slice(0, 8).map(product => (
                    <span
                      key={product.id}
                      className="text-xs bg-white border border-surface-border text-slate-600 px-2 py-0.5 rounded-md"
                    >
                      {product.name}
                    </span>
                  ))}
                  {selectedNames.length > 8 && (
                    <span className="text-xs text-slate-400 px-1 py-0.5">
                      +{selectedNames.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={listQuery}
                onChange={e => setListQuery(e.target.value)}
                placeholder="Search products by name or HSN..."
                className="form-input pl-9"
                autoFocus
              />
            </div>

            <div className="border border-surface-border rounded-xl max-h-72 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  {state.products.length === 0
                    ? 'No products available. Add products first.'
                    : 'No products match your search.'}
                </div>
              ) : (
                filteredProducts.map(product => {
                  const checked = selectedIds.includes(product.id);
                  return (
                    <label
                      key={product.id}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-surface-border last:border-0 cursor-pointer transition-colors ${
                        checked ? 'bg-primary-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(product.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{product.name}</p>
                        <p className="text-xs text-slate-400">
                          {product.hsn ? `HSN ${product.hsn}` : 'No HSN'}
                          {product.category ? ` · ${product.category}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-primary-600">₹{product.rate}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </SettingsModal>
      )}

      {/* Backup modal */}
      {activeModal === 'backup' && (
        <SettingsModal
          title="Database Backup"
          subtitle="Protect your inventory, sales, and purchase data"
          icon={FileText}
          onClose={closeModal}
          footer={(
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={closeModal} className="btn-secondary text-sm">
                Close
              </button>
              <button
                type="button"
                onClick={handleBackup}
                disabled={backupRunning}
                className="btn-primary disabled:opacity-50"
              >
                <HardDrive className="w-4 h-4" />
                {backupRunning ? 'Backing up...' : 'Run Backup Now'}
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                Creates a full SQLite copy of your pharmacy database. Keep backups on a safe drive
                so you can restore after hardware issues.
              </p>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
              <li>Products, batches, and stock levels</li>
              <li>Sales and purchase invoices</li>
              <li>Customers, suppliers, and company profile</li>
            </ul>
            {backupStatus && (
              <div
                className={`text-sm font-medium rounded-xl px-4 py-3 ${
                  backupStatus.type === 'error'
                    ? 'bg-red-50 text-danger'
                    : backupStatus.type === 'success'
                      ? 'bg-emerald-50 text-success'
                      : 'bg-primary-50 text-primary-700'
                }`}
              >
                {backupStatus.type === 'success' && '✓ '}
                {backupStatus.type === 'error' && '✕ '}
                {backupStatus.msg}
              </div>
            )}
          </div>
        </SettingsModal>
      )}

      {/* Tax modal */}
      {activeModal === 'tax' && (
        <SettingsModal
          title="Default Tax Rates"
          subtitle="Applied when adding new products — can still be overridden per item"
          icon={Percent}
          onClose={closeModal}
          footer={(
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={closeModal} className="btn-secondary text-sm">
                Cancel
              </button>
              <div className="flex items-center gap-3">
                {taxSaved && <span className="text-sm text-success font-medium">✓ Saved</span>}
                <button type="submit" form="tax-settings-form" className="btn-success">
                  <Save className="w-4 h-4" />
                  Save Rates
                </button>
              </div>
            </div>
          )}
        >
          <form id="tax-settings-form" onSubmit={handleSaveTax} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { key: 'cgst', label: 'Default CGST %' },
                { key: 'sgst', label: 'Default SGST %' },
                { key: 'igst', label: 'Default IGST %' },
              ].map(field => (
                <div key={field.key}>
                  <label className="form-label">{field.label}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={taxForm[field.key]}
                    onChange={e => setTaxForm(prev => ({
                      ...prev,
                      [field.key]: Math.max(0, Number(e.target.value) || 0),
                    }))}
                    className="form-input"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              These rates are remembered for this session when adding products. Product-level
              taxes still take priority on bills.
            </p>
          </form>
        </SettingsModal>
      )}
    </div>
  );
}
