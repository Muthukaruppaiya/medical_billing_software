import { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Calendar, FileText, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useReactToPrint } from 'react-to-print';
import PurchaseDetailModal from '../purchase/PurchaseDetailModal';

const SORTABLE = [
  { key: 'id', label: 'PO #' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
];

const SUMMARY_HEADERS = [
  'S.No.',
  'PO #',
  'Date',
  'Supplier',
  'Amount',
  'Status',
  'Document',
  'Payment Status',
  'Payment Method',
];

const LINE_HEADERS = [
  'S.No.',
  'PO #',
  'Date',
  'Supplier',
  'Product Name',
  'Batch',
  'Expiry',
  'Qty',
  'Rate',
  'Disc%',
  'GST%',
  'Line Amount',
  'PO Status',
];

function parsePoDate(dStr) {
  if (!dStr) return 0;
  const parts = String(dStr).split('-');
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
  }
  return 0;
}

function compareValues(a, b, key) {
  if (key === 'date') return parsePoDate(a.date) - parsePoDate(b.date);
  if (key === 'amount') return Number(a.amount || 0) - Number(b.amount || 0);
  const av = String(a[key] ?? '').toLowerCase();
  const bv = String(b[key] ?? '').toLowerCase();
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
  return dir === 'asc'
    ? <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
    : <ArrowDown className="w-3.5 h-3.5 text-teal-600" />;
}

function buildSummaryRows(purchases) {
  return purchases.map((po, index) => ({
    'S.No.': index + 1,
    'PO #': po.id || '',
    Date: po.date || '',
    Supplier: po.supplier || '',
    Amount: Number(po.amount || 0),
    Status: po.status || '',
    Document: po.hasDocument || po.documentName ? (po.documentName || 'Attached') : 'Missing',
    'Payment Status': po.paymentStatus || '',
    'Payment Method': po.paymentMethod || '',
  }));
}

function buildLineRows(purchases) {
  const rows = [];
  purchases.forEach((po, poIndex) => {
    const items = Array.isArray(po.items) && po.items.length
      ? po.items
      : [{ product: { name: '—' }, qty: 0, rate: 0, batch: '', expiry: '' }];

    items.forEach((item, itemIndex) => {
      const gst =
        item.gstPercent != null
          ? Number(item.gstPercent)
          : (Number(item.cgst) || 0) + (Number(item.sgst) || 0);
      const lineAmt = item.total ?? (Number(item.qty || 0) * Number(item.rate || 0));
      rows.push({
        'S.No.': itemIndex === 0 ? poIndex + 1 : '',
        'PO #': itemIndex === 0 ? (po.id || '') : '',
        Date: itemIndex === 0 ? (po.date || '') : '',
        Supplier: itemIndex === 0 ? (po.supplier || '') : '',
        'Product Name': item.product?.name || '—',
        Batch: item.batch || item.product?.batch || '',
        Expiry: item.expiry || item.product?.expiry || '',
        Qty: Number(item.qty || 0),
        Rate: Number(item.rate || 0),
        'Disc%': Number(item.discount || item.discPercent || 0),
        'GST%': gst,
        'Line Amount': Number(lineAmt || 0),
        'PO Status': itemIndex === 0 ? (po.status || '') : '',
      });
    });
  });
  return rows;
}

export default function PurchaseReport() {
  const { state } = useApp();
  const pdfRef = useRef(null);
  const [selectedPurchase, setSelectedPurchase] = useState(null);

  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [documentFilter, setDocumentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const supplierOptions = useMemo(() => {
    const names = new Set(
      (state.purchaseInvoices || [])
        .map(po => po.supplier)
        .filter(Boolean)
    );
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [state.purchaseInvoices]);

  const filteredPurchases = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate).getTime() : 0;
    const toTs = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : Infinity;
    const q = searchQuery.trim().toLowerCase();

    const rows = (state.purchaseInvoices || []).filter(po => {
      const poTs = parsePoDate(po.date);
      if (poTs < fromTs || poTs > toTs) return false;

      if (supplierFilter !== 'all' && po.supplier !== supplierFilter) return false;

      if (statusFilter !== 'all') {
        const status = String(po.status || '').toLowerCase();
        if (status !== statusFilter.toLowerCase()) return false;
      }

      const hasDoc = Boolean(po.hasDocument || po.documentName);
      if (documentFilter === 'attached' && !hasDoc) return false;
      if (documentFilter === 'missing' && hasDoc) return false;

      if (q) {
        const hay = `${po.id || ''} ${po.supplier || ''} ${po.status || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      const cmp = compareValues(a, b, sortKey);
      if (cmp !== 0) return cmp * dir;
      return compareValues(a, b, 'id') * dir;
    });
  }, [
    state.purchaseInvoices,
    fromDate,
    toDate,
    supplierFilter,
    statusFilter,
    documentFilter,
    searchQuery,
    sortKey,
    sortDir,
  ]);

  const summaryRows = useMemo(() => buildSummaryRows(filteredPurchases), [filteredPurchases]);
  const total = filteredPurchases.reduce((s, i) => s + Number(i.amount || 0), 0);

  const supplierBreakdown = useMemo(() => {
    const supTotals = {};
    filteredPurchases.forEach(po => {
      const name = po.supplier || 'Unknown';
      supTotals[name] = (supTotals[name] || 0) + Number(po.amount || 0);
    });
    const list = Object.keys(supTotals)
      .map(name => ({ name, amount: supTotals[name] }))
      .sort((a, b) => b.amount - a.amount);
    return list.length > 0 ? list : [{ name: 'No Purchase Data', amount: 0 }];
  }, [filteredPurchases]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'amount' ? 'desc' : 'asc');
    }
  };

  const handleExcelExport = () => {
    if (!filteredPurchases.length) {
      alert('No records available to export for the selected filters.');
      return;
    }

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows, { header: SUMMARY_HEADERS });
    summarySheet['!cols'] = SUMMARY_HEADERS.map(header => {
      if (header === 'Supplier' || header === 'Document') return { wch: 22 };
      if (header === 'PO #') return { wch: 18 };
      if (header === 'Amount') return { wch: 14 };
      return { wch: 12 };
    });

    const lineRows = buildLineRows(filteredPurchases);
    const linesSheet = XLSX.utils.json_to_sheet(lineRows, { header: LINE_HEADERS });
    linesSheet['!cols'] = LINE_HEADERS.map(header => {
      if (header === 'Product Name' || header === 'Supplier') return { wch: 24 };
      if (header === 'PO #') return { wch: 16 };
      return { wch: 11 };
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'PO Summary');
    XLSX.utils.book_append_sheet(workbook, linesSheet, 'Line Items');
    XLSX.writeFile(workbook, `Purchase_Report_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`);
  };

  const handlePdfPrint = useReactToPrint({
    contentRef: pdfRef,
    documentTitle: `Purchase_Report_${dayjs().format('YYYYMMDD')}`,
  });

  const handlePdfExport = () => {
    if (!filteredPurchases.length) {
      alert('No records available to export for the selected filters.');
      return;
    }
    handlePdfPrint();
  };

  const periodLabel = `${dayjs(fromDate).format('DD-MM-YYYY')} to ${dayjs(toDate).format('DD-MM-YYYY')}`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hidden printable PDF layout */}
      <div className="fixed -left-[9999px] top-0 w-[1000px]">
        <div ref={pdfRef} className="bg-white p-8 text-slate-800">
          <style>{`
            @media print {
              @page { size: A4 landscape; margin: 10mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `}</style>
          <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
            <h1 className="text-xl font-extrabold">{state.company?.name || 'MediCare Pharmacy'}</h1>
            {state.company?.address && (
              <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{state.company.address}</p>
            )}
            <p className="text-sm font-semibold mt-2">Purchase Report</p>
            <p className="text-xs text-slate-500">Period: {periodLabel}</p>
            {(supplierFilter !== 'all' || statusFilter !== 'all' || documentFilter !== 'all' || searchQuery.trim()) && (
              <p className="text-xs text-slate-500 mt-0.5">
                Filters:
                {supplierFilter !== 'all' ? ` Supplier=${supplierFilter}` : ''}
                {statusFilter !== 'all' ? ` Status=${statusFilter}` : ''}
                {documentFilter !== 'all' ? ` Document=${documentFilter}` : ''}
                {searchQuery.trim() ? ` Search="${searchQuery.trim()}"` : ''}
              </p>
            )}
          </div>

          <table className="w-full border-collapse text-xs mb-4">
            <thead>
              <tr className="bg-teal-800 text-white">
                {SUMMARY_HEADERS.map(header => (
                  <th key={header} className="border border-slate-300 p-2 text-left font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {SUMMARY_HEADERS.map(header => (
                    <td key={header} className="border border-slate-200 p-2">
                      {header === 'Amount'
                        ? `₹${Number(row.Amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end text-sm font-bold">
            <div className="border border-slate-300 rounded px-4 py-2 bg-slate-50">
              Total ({filteredPurchases.length} POs): ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="mt-16 flex justify-end">
            <div className="w-64 text-center text-xs">
              <div className="border-t border-slate-700 pt-2 mt-12">
                <p className="font-semibold">Authorized Signature</p>
                <p className="text-slate-500 mt-1">Name &amp; Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="form-label text-xs">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="form-input pl-9 text-sm py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="form-label text-xs">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="form-input pl-9 text-sm py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="form-label text-xs">Supplier</label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="form-select text-sm py-1.5 min-w-[10rem]"
            >
              <option value="all">All Suppliers</option>
              {supplierOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label text-xs">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select text-sm py-1.5"
            >
              <option value="all">All Status</option>
              <option value="Received">Received</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="form-label text-xs">Document</label>
            <select
              value={documentFilter}
              onChange={(e) => setDocumentFilter(e.target.value)}
              className="form-select text-sm py-1.5"
            >
              <option value="all">All Documents</option>
              <option value="attached">Has Document</option>
              <option value="missing">Needs Attach</option>
            </select>
          </div>
          <div>
            <label className="form-label text-xs">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="PO # or supplier…"
                className="form-input pl-9 text-sm py-1.5 min-w-[12rem]"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={handlePdfExport} className="btn-secondary text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />PDF
          </button>
          <button type="button" onClick={handleExcelExport} className="btn-success text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-teal-50/50">
          <p className="text-sm text-slate-500">Filtered Total Purchases</p>
          <p className="text-2xl font-bold text-teal-600 mt-1">₹{total.toLocaleString('en-IN')}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Purchase Orders</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{filteredPurchases.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Pending Orders (In Range)</p>
          <p className="text-2xl font-bold text-warning mt-1">
            {filteredPurchases.filter(i => i.status === 'Pending').length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card col-span-1 border border-slate-100 shadow-sm" style={{ height: 320 }}>
          <h3 className="font-semibold text-slate-700 mb-4">Supplier Breakdown</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={supplierBreakdown} layout="vertical" barSize={16} margin={{ left: 80, right: 20, top: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                     tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => `₹${Number(v).toLocaleString('en-IN')}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
              <Bar dataKey="amount" name="Purchase Amount" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card col-span-1 lg:col-span-2 border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h3 className="font-semibold text-slate-700">Purchase Orders</h3>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded shrink-0">
              {filteredPurchases.length} POs Found
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {SORTABLE.map(col => (
                    <th key={col.key}>
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide hover:text-teal-700"
                        title={`Sort by ${col.label}`}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    </th>
                  ))}
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      No purchase orders found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map(po => (
                    <tr key={po.id}>
                      <td
                        className="font-medium text-teal-600 cursor-pointer hover:underline"
                        onClick={() => setSelectedPurchase(po)}
                      >
                        {po.id}
                      </td>
                      <td className="font-medium text-slate-700">{po.supplier}</td>
                      <td className="text-slate-500">{po.date}</td>
                      <td className="font-bold text-slate-800">
                        ₹{Number(po.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className={`badge ${po.status === 'Received' ? 'badge-success' : 'badge-warning'}`}>
                          {po.status}
                        </span>
                      </td>
                      <td>
                        {po.hasDocument || po.documentName ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPurchase(po)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                            title={po.documentName || 'View document'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            View
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedPurchase(po)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline"
                            title="Attach missing document"
                          >
                            Attach
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedPurchase && (
        <PurchaseDetailModal
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          onPurchaseUpdated={(updated) => setSelectedPurchase(updated)}
        />
      )}
    </div>
  );
}
