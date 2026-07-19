import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { AlertTriangle, Download, Search, PackageX, IndianRupee } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useReactToPrint } from 'react-to-print';

const money = value =>
  Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getStatus = daysLeft => {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  return 'monitor';
};

export default function ExpiryReport() {
  const { state } = useApp();
  const [filter, setFilter] = useState(90);
  const [statusFilter, setStatusFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showZeroStock, setShowZeroStock] = useState(false);
  const printRef = useRef(null);

  const today = dayjs();
  const allBatches = useMemo(
    () => state.products
      .flatMap(product => (product.batches || []).map(batch => ({
        ...product,
        batchId: batch.id,
        batch: batch.batch,
        expiry: batch.expiry,
        stock: Number(batch.stock || 0),
        rate: Number(batch.rate || 0),
        mrp: Number(batch.mrp || 0),
        daysLeft: dayjs(batch.expiry).diff(today, 'day'),
      })))
      .filter(product => product.expiry && dayjs(product.expiry).isValid()),
    [state.products]
  );

  const activeBatches = allBatches.filter(product => product.stock > 0);
  const expired = activeBatches.filter(product => product.daysLeft < 0);
  const critical = activeBatches.filter(
    product => product.daysLeft >= 0 && product.daysLeft <= 30
  );
  const warning = activeBatches.filter(
    product => product.daysLeft > 30 && product.daysLeft <= 90
  );

  const categories = useMemo(
    () => [...new Set(allBatches.map(product => product.category).filter(Boolean))].sort(),
    [allBatches]
  );

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allBatches
      .filter(product => product.daysLeft <= filter)
      .filter(product => showZeroStock || product.stock > 0)
      .filter(product => category === 'all' || product.category === category)
      .filter(product => statusFilter === 'all' || getStatus(product.daysLeft) === statusFilter)
      .filter(product =>
        !query ||
        product.name?.toLowerCase().includes(query) ||
        product.batch?.toLowerCase().includes(query) ||
        product.manufacturer?.toLowerCase().includes(query)
      )
      .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  }, [allBatches, category, filter, search, showZeroStock, statusFilter]);

  const totalUnits = products.reduce((sum, product) => sum + product.stock, 0);
  const stockValue = products.reduce(
    (sum, product) => sum + product.stock * product.rate,
    0
  );

  const rowColor = (days) => {
    if (days < 0)   return 'bg-red-50';
    if (days <= 30) return 'bg-amber-50';
    return '';
  };

  const selectSummary = value => {
    setStatusFilter(current => current === value ? 'all' : value);
    if (value === 'critical' && filter < 30) setFilter(30);
    if (value === 'monitor' && filter < 90) setFilter(90);
  };

  const exportExcel = () => {
    const rows = products.map((product, index) => ({
      'S.No.': index + 1,
      'Product Name': product.name,
      Manufacturer: product.manufacturer || '',
      Category: product.category || '',
      Batch: product.batch || '',
      Stock: product.stock,
      'Purchase Rate': product.rate,
      MRP: product.mrp,
      'Stock Value': Number((product.stock * product.rate).toFixed(2)),
      'Expiry Date': product.expiry,
      'Days Left': product.daysLeft,
      Status: getStatus(product.daysLeft),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 16 },
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expiry Report');
    XLSX.writeFile(
      workbook,
      `Expiry_Report_${filter}_days_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
    );
  };

  const printPdf = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Expiry_Report_${filter}_days_${dayjs().format('YYYYMMDD')}`,
  });

  return (
    <div className="space-y-6">
      {/* Summary chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => selectSummary('expired')}
          className={clsx(
            'card border-l-4 border-danger text-left transition-shadow hover:shadow-md',
            statusFilter === 'expired' && 'ring-2 ring-red-200'
          )}
        >
          <p className="text-sm text-slate-500">Already Expired</p>
          <p className="text-2xl font-bold text-danger mt-1">{expired.length} batches</p>
          <p className="text-xs text-slate-400 mt-1">
            {expired.reduce((sum, item) => sum + item.stock, 0)} units in stock
          </p>
        </button>
        <button
          type="button"
          onClick={() => selectSummary('critical')}
          className={clsx(
            'card border-l-4 border-warning text-left transition-shadow hover:shadow-md',
            statusFilter === 'critical' && 'ring-2 ring-amber-200'
          )}
        >
          <p className="text-sm text-slate-500">Expiring ≤ 30 days</p>
          <p className="text-2xl font-bold text-warning mt-1">{critical.length} batches</p>
          <p className="text-xs text-slate-400 mt-1">
            {critical.reduce((sum, item) => sum + item.stock, 0)} units need action
          </p>
        </button>
        <button
          type="button"
          onClick={() => selectSummary('monitor')}
          className={clsx(
            'card border-l-4 border-info text-left transition-shadow hover:shadow-md',
            statusFilter === 'monitor' && 'ring-2 ring-cyan-200'
          )}
        >
          <p className="text-sm text-slate-500">Expiring 31–90 days</p>
          <p className="text-2xl font-bold text-info mt-1">{warning.length} batches</p>
          <p className="text-xs text-slate-400 mt-1">
            {warning.reduce((sum, item) => sum + item.stock, 0)} units to monitor
          </p>
        </button>
        <div className="card border-l-4 border-primary-500">
          <p className="text-sm text-slate-500">Filtered Stock at Risk</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">₹{money(stockValue)}</p>
          <p className="text-xs text-slate-400 mt-1">{totalUnits} units · {products.length} batches</p>
        </div>
      </div>

      {/* Controls */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
          {[30, 60, 90, 180].map(d => (
            <button
              type="button"
              key={d}
              onClick={() => setFilter(d)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filter === d ? 'bg-primary-500 text-white' : 'bg-white border border-surface-border text-slate-600 hover:bg-slate-50'
              )}
            >
              Next {d} days
            </button>
          ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={printPdf} className="btn-secondary text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" />PDF
            </button>
            <button type="button" onClick={exportExcel} className="btn-success text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" />Excel
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_180px_auto] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="form-input pl-9"
              placeholder="Search product, batch or manufacturer..."
            />
          </div>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className="form-select"
          >
            <option value="all">All categories</option>
            {categories.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="form-select"
          >
            <option value="all">All statuses</option>
            <option value="expired">Expired</option>
            <option value="critical">Critical (0–30 days)</option>
            <option value="monitor">Monitor (31+ days)</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showZeroStock}
              onChange={event => setShowZeroStock(event.target.checked)}
              className="rounded border-slate-300"
            />
            Show zero stock
          </label>
        </div>
      </div>

      {/* Table */}
      <div ref={printRef} className="card p-0 overflow-hidden">
        <div className="hidden print:block px-5 pt-5">
          <h1 className="text-xl font-bold">Expiry Stock Report</h1>
          <p className="text-xs text-slate-500">
            Generated {dayjs().format('DD-MM-YYYY hh:mm A')} · Within {filter} days
          </p>
        </div>
        <div className="px-5 py-3 border-b border-surface-border flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <h3 className="font-semibold text-slate-700">Expiry Alert — Products expiring within {filter} days</h3>
          <span className="ml-auto text-xs text-slate-400">{products.length} batches</span>
        </div>
        <div className="table-wrapper border-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Batch</th>
                <th>Stock</th>
                <th>Rate</th>
                <th>Stock Value</th>
                <th>Expiry Date</th>
                <th>Days Left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    <PackageX className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No expiry batches match the selected filters
                  </td>
                </tr>
              ) : (
                products.map((p, i) => (
                  <tr key={`${p.id}-${p.batchId}`} className={rowColor(p.daysLeft)}>
                    <td className="text-slate-400">{i + 1}</td>
                    <td className="font-medium text-slate-800">{p.name}</td>
                    <td><span className="badge badge-info">{p.category}</span></td>
                    <td className="text-slate-500 text-xs">{p.batch}</td>
                    <td className="font-semibold">{p.stock}</td>
                    <td className="text-slate-600">₹{money(p.rate)}</td>
                    <td className="font-semibold text-slate-700">
                      <span className="inline-flex items-center">
                        <IndianRupee className="w-3 h-3" />{money(p.stock * p.rate)}
                      </span>
                    </td>
                    <td className={clsx('font-medium', p.daysLeft < 0 ? 'text-danger' : p.daysLeft <= 30 ? 'text-warning' : 'text-slate-700')}>
                      {p.expiry}
                    </td>
                    <td>
                      {p.daysLeft < 0
                        ? <span className="badge badge-danger">{Math.abs(p.daysLeft)}d expired</span>
                        : <span className={`badge ${p.daysLeft <= 30 ? 'badge-warning' : 'badge-info'}`}>{p.daysLeft}d left</span>
                      }
                    </td>
                    <td>
                      {p.daysLeft < 0
                        ? <span className="badge badge-danger">Expired</span>
                        : p.daysLeft <= 30
                        ? <span className="badge badge-warning">Critical</span>
                        : <span className="badge badge-info">Monitor</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {products.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={4} className="text-right">Total</td>
                  <td>{totalUnits}</td>
                  <td></td>
                  <td>₹{money(stockValue)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
