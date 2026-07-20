import { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FileText, TrendingUp, Download, Calendar, CheckCircle, Percent, Trash2, Users } from 'lucide-react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useReactToPrint } from 'react-to-print';
import InvoiceDetailModal from '../billing/InvoiceDetailModal';
import CustomerHistoryModal from './CustomerHistoryModal';

const isConsolidatedInvoice = inv =>
  inv.id?.startsWith('SLS-') || inv.customer === 'Bulk Small Sales Summary';

const BASE_EXPORT_HEADERS = [
  'S.No.',
  'Date',
  'Doctor Name',
  'Patient Name',
  'Product Name',
  'Batch Name',
  'Expiry Date',
  'Quantity',
];

const STANDARD_EXPORT_HEADERS = [
  'S.No.',
  'Bill No',
  'Date',
  'Doctor Name',
  'Patient Name',
  'Customer Address',
  'Product Name',
  'Manufacturer Name',
  'Batch Name',
  'Expiry Date',
  'Quantity',
  'Signature',
];

// Invoice-level columns are merged across product rows in Excel/PDF.
const getInvoiceLevelHeaders = headers =>
  headers.filter(header =>
    ['S.No.', 'Bill No', 'Date', 'Doctor Name', 'Patient Name', 'Customer Address'].includes(header)
  );

function buildExportRows(invoices, { standard = false, customers = [] } = {}) {
  const rows = [];

  invoices.forEach((inv, invoiceIndex) => {
    const items = Array.isArray(inv.items) && inv.items.length
      ? inv.items
      : [{ product: { name: '—' }, qty: 0, batch: '', expiry: '', manufacturer: '' }];

    const matchedCustomer = customers.find(
      customer =>
        (inv.customerId && Number(customer.id) === Number(inv.customerId)) ||
        (!inv.customerId && customer.name === inv.customer)
    );
    const customerAddress = inv.customerAddress || matchedCustomer?.address || '';

    items.forEach((item, itemIndex) => {
      const firstProduct = itemIndex === 0;
      const row = {
        'S.No.': firstProduct ? invoiceIndex + 1 : '',
        Date: firstProduct ? inv.date || '' : '',
        'Doctor Name': firstProduct ? inv.doctor || '' : '',
        'Patient Name': firstProduct ? inv.patient || '' : '',
        'Product Name': item.product?.name || '—',
        'Batch Name': item.batch || item.product?.batch || '',
        'Expiry Date': item.expiry || item.product?.expiry || '',
        Quantity: Number(item.qty || 0),
        _firstProduct: firstProduct,
        _rowSpan: items.length,
        _invoiceIndex: invoiceIndex,
      };

      if (standard) {
        row['Bill No'] = firstProduct ? inv.id || '' : '';
        row['Customer Address'] = firstProduct ? customerAddress : '';
        row['Manufacturer Name'] = item.product?.manufacturer || item.manufacturer || '';
        // Signature blank on every product row for handwritten sign-off.
        row.Signature = '';
      }

      rows.push(row);
    });
  });

  return rows;
}

export default function SalesReport() {
  const { state, dispatch } = useApp();
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [saleType, setSaleType] = useState('all');
  const pdfRef = useRef(null);

  const parseDate = (dStr) => {
    if (!dStr) return 0;
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }
    return 0;
  };

  const getCreatedAt = (invoice) => {
    const direct = Number(invoice.createdAt);
    if (Number.isFinite(direct) && direct > 0) return direct;

    // Prefer full timestamp from newer invoice IDs: INV-1710000000000
    const idMatch = String(invoice.id || '').match(/-(\d{10,})$/);
    if (idMatch) return Number(idMatch[1]);

    // Older short IDs are only a weak hint for same-day ordering.
    const shortMatch = String(invoice.id || '').match(/-(\d+)$/);
    if (shortMatch) return Number(shortMatch[1]);

    return 0;
  };

  const filteredInvoices = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate).getTime() : 0;
    const toTs = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : Infinity;

    return state.invoices
      .filter(inv => {
        if (inv.type !== 'sale') return false;
        const invTs = parseDate(inv.date);
        if (invTs < fromTs || invTs > toTs) return false;

        const consolidated = isConsolidatedInvoice(inv);
        if (saleType === 'consolidated') return consolidated;
        if (saleType === 'standard') return !consolidated;
        return true;
      })
      .sort((a, b) => {
        const dateDifference = parseDate(a.date) - parseDate(b.date);
        if (dateDifference !== 0) return dateDifference;
        // Same calendar day: order by exact create time (oldest → latest).
        return getCreatedAt(a) - getCreatedAt(b);
      });
  }, [state.invoices, fromDate, toDate, saleType]);

  const exportHeaders = saleType === 'standard' ? STANDARD_EXPORT_HEADERS : BASE_EXPORT_HEADERS;
  const invoiceLevelHeaders = getInvoiceLevelHeaders(exportHeaders);
  const invoiceLevelCount = invoiceLevelHeaders.length;

  const exportRows = useMemo(
    () => buildExportRows(filteredInvoices, {
      standard: saleType === 'standard',
      customers: state.customers,
    }),
    [filteredInvoices, saleType, state.customers]
  );

  const totalSales = filteredInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);

  let salesWithGst = 0;
  let salesWithoutGst = 0;

  filteredInvoices.forEach(inv => {
    const tax = Number(inv.tax || 0);
    const amt = Number(inv.amount || 0);
    if (tax > 0) salesWithGst += amt;
    else salesWithoutGst += amt;
  });

  const avgOrder = totalSales / (filteredInvoices.length || 1);

  const saleTypeLabel =
    saleType === 'standard'
      ? 'Standard Bills'
      : saleType === 'consolidated'
        ? 'Consolidated Sales'
        : 'All Sales';

  const customerInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return state.invoices
      .filter(invoice => {
        if (invoice.type !== 'sale') return false;
        if (selectedCustomer.id && invoice.customerId) {
          return Number(invoice.customerId) === Number(selectedCustomer.id);
        }
        return invoice.customer === selectedCustomer.name;
      })
      .sort((a, b) => {
        const dateDifference = parseDate(a.date) - parseDate(b.date);
        if (dateDifference !== 0) return dateDifference;
        return getCreatedAt(a) - getCreatedAt(b);
      });
  }, [state.invoices, selectedCustomer]);

  const openCustomerHistory = invoice => {
    const registeredCustomer = state.customers.find(
      customer =>
        (invoice.customerId && Number(customer.id) === Number(invoice.customerId)) ||
        (!invoice.customerId && customer.name === invoice.customer)
    );
    setSelectedCustomer(registeredCustomer || { name: invoice.customer });
  };

  const deleteInvoice = async (invoice) => {
    const confirmed = window.confirm(
      `Delete invoice ${invoice.id}?\n\nAll quantities will be returned to their original batches. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(invoice.id);
    try {
      await dispatch({ type: 'DELETE_INVOICE', payload: invoice.id });
      if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
    } catch (error) {
      alert(error.message || 'Failed to delete invoice');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExcelExport = () => {
    if (!exportRows.length) {
      alert('No records available to export for the selected filters.');
      return;
    }

    const worksheetRows = exportRows.map(row =>
      Object.fromEntries(exportHeaders.map(header => [header, row[header]]))
    );
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows, { header: exportHeaders });
    worksheet['!cols'] = exportHeaders.map(header => {
      if (header === 'Customer Address') return { wch: 28 };
      if (header === 'Product Name' || header === 'Manufacturer Name') return { wch: 24 };
      if (header === 'Signature') return { wch: 16 };
      if (header === 'Bill No') return { wch: 18 };
      return { wch: 12 };
    });
    worksheet['!merges'] = exportRows.flatMap((row, rowIndex) => {
      if (!row._firstProduct || row._rowSpan <= 1) return [];
      // Row 0 contains headers; data starts at row 1.
      return Array.from({ length: invoiceLevelCount }, (_, column) => ({
        s: { r: rowIndex + 1, c: column },
        e: { r: rowIndex + row._rowSpan, c: column },
      }));
    });

    // Blank rows + signature block at the bottom (overall authorization)
    const start = exportRows.length + 3;
    XLSX.utils.sheet_add_aoa(
      worksheet,
      [
        [],
        ['Authorized Signature: ______________________________'],
        ['Name: ______________________________'],
        ['Date: ______________________________'],
      ],
      { origin: `A${start}` }
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Report');
    const fileName = `Sales_Report_${saleType}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handlePdfPrint = useReactToPrint({
    contentRef: pdfRef,
    documentTitle: `Sales_Report_${saleType}_${dayjs().format('YYYYMMDD')}`,
  });

  const handlePdfExport = () => {
    if (!exportRows.length) {
      alert('No records available to export for the selected filters.');
      return;
    }
    handlePdfPrint();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hidden printable PDF layout */}
      <div className="fixed -left-[9999px] top-0 w-[1100px]">
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
              <p className="text-xs text-slate-600 mt-1">{state.company.address}</p>
            )}
            <p className="text-sm font-semibold mt-2">Sales Report — {saleTypeLabel}</p>
            <p className="text-xs text-slate-500">
              Period: {dayjs(fromDate).format('DD-MM-YYYY')} to {dayjs(toDate).format('DD-MM-YYYY')}
            </p>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                {exportHeaders.map(header => (
                  <th key={header} className="border border-slate-300 p-2 text-left font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exportRows.map((row, index) => (
                <tr key={index} className={row._invoiceIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {row._firstProduct && (
                    <>
                      {exportHeaders.slice(0, invoiceLevelCount).map(header => (
                        <td
                          key={header}
                          rowSpan={row._rowSpan}
                          className="border border-slate-200 p-2 align-top whitespace-pre-line"
                        >
                          {row[header]}
                        </td>
                      ))}
                    </>
                  )}
                  {exportHeaders.slice(invoiceLevelCount).map(header => (
                    <td
                      key={header}
                      className={`border border-slate-200 p-2 ${
                        header === 'Signature' ? 'min-w-[90px] h-10' : ''
                      }`}
                    >
                      {header === 'Signature' ? '' : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

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

      {/* Filters */}
      <div className="card flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
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
            <label className="form-label text-xs">Customer History</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={selectedCustomer?.id || ''}
                onChange={event => {
                  const customer = state.customers.find(
                    item => Number(item.id) === Number(event.target.value)
                  );
                  if (customer) setSelectedCustomer(customer);
                }}
                className="form-select pl-9 text-sm py-1.5 min-w-52"
              >
                <option value="">Select customer...</option>
                {state.customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.phone ? ` · ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label text-xs">Billing Type</label>
            <select
              value={saleType}
              onChange={event => setSaleType(event.target.value)}
              className="form-select text-sm py-1.5 min-w-44"
            >
              <option value="all">All Sales</option>
              <option value="consolidated">Consolidated Sales</option>
              <option value="standard">Standard Bills</option>
            </select>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card flex items-center gap-4 bg-primary-50">
          <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Sales (Filtered)</p>
            <p className="text-xl font-bold text-primary-600">₹{totalSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4 bg-emerald-50">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Percent className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Sales With GST</p>
            <p className="text-xl font-bold text-emerald-600">₹{salesWithGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4 bg-slate-50">
          <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Sales Without GST</p>
            <p className="text-xl font-bold text-slate-700">₹{salesWithoutGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4 bg-purple-50">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Avg Order Value</p>
            <p className="text-xl font-bold text-purple-600">₹{avgOrder.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="card border border-slate-100 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800">Filtered Sales Data</h3>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
            {filteredInvoices.length} Invoices Found · {exportRows.length} line items
          </span>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                {saleType === 'standard' && <th>Customer Address</th>}
                <th>Tax / GST</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={saleType === 'standard' ? 8 : 7} className="text-center py-12 text-slate-400">
                    No sales invoices found for the selected date range.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const matchedCustomer = state.customers.find(
                    customer =>
                      (inv.customerId && Number(customer.id) === Number(inv.customerId)) ||
                      (!inv.customerId && customer.name === inv.customer)
                  );
                  const address = inv.customerAddress || matchedCustomer?.address || '—';
                  return (
                  <tr key={inv.id}>
                    <td
                      className="font-medium text-primary-600 cursor-pointer hover:underline"
                      onClick={() => setSelectedInvoice(inv)}
                    >
                      {inv.id}
                    </td>
                    <td className="text-slate-500">{inv.date}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openCustomerHistory(inv)}
                        className="font-medium text-slate-700 hover:text-primary-600 hover:underline text-left"
                        title="View complete customer purchase history"
                      >
                        {inv.customer}
                      </button>
                    </td>
                    {saleType === 'standard' && (
                      <td className="text-xs text-slate-500 max-w-[220px] whitespace-pre-line">
                        {address}
                      </td>
                    )}
                    <td className={`font-semibold ${Number(inv.tax) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {Number(inv.tax) > 0 ? `₹${Number(inv.tax).toFixed(2)}` : 'None'}
                    </td>
                    <td className="font-bold text-slate-800">₹{Number(inv.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : inv.status === 'Unpaid' ? 'badge-danger' : 'badge-warning'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => deleteInvoice(inv)}
                        disabled={deletingId === inv.id}
                        title="Delete invoice and restore stock"
                        className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-danger transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
      {selectedCustomer && (
        <CustomerHistoryModal
          customer={selectedCustomer}
          invoices={customerInvoices}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
  );
}
