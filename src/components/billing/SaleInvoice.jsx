import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useInvoice, nextDocumentNo } from '../../hooks/useInvoice';
import ProductRow from './ProductRow';
import InvoiceSummary from './InvoiceSummary';
import PrintBillModal from './PrintBillModal';
import AddCustomerModal from '../customers/AddCustomerModal';
import { Plus, Search, UserPlus } from 'lucide-react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { isExpiryValid } from '../../utils/expiry';
import { getCustomerDue, round2 } from '../../utils/money';

const isSellableBatch = batch =>
  Number(batch.stock) > 0 && isExpiryValid(batch.expiry);

function saleNumberPreview() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `SL${yy}${mm}…`;
}

export default function SaleInvoice({ onSaved }) {
  const { state, dispatch } = useApp();

  // Customer
  const [customer, setCustomer]     = useState(null);
  const [custQuery, setCustQuery]   = useState('');
  const [showCustDD, setShowCustDD] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // Product search
  const [prodQuery, setProdQuery]   = useState('');
  const [showProdDD, setShowProdDD] = useState(false);

  // Cart
  const [cart, setCart]   = useState([]);
  const [gstin, setGstin] = useState('');
  const [patient, setPatient] = useState('');
  const [doctor, setDoctor] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMode, setPaymentMode] = useState('full');
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  // Print Bill popup state
  const [savedInvoice, setSavedInvoice] = useState(null);

  const [invoiceNo, setInvoiceNo] = useState(saleNumberPreview);
  const totals    = useInvoice(cart);

  const customerDue = useMemo(
    () => getCustomerDue(state.invoices, customer),
    [state.invoices, customer]
  );

  // ── Customer search ───────────────────────────────────────────────────────
  const custResults = state.customers.filter(c =>
    c.name.toLowerCase().includes(custQuery.toLowerCase()) ||
    c.phone.includes(custQuery)
  ).slice(0, 6);

  // Auto-open Add Customer if 10 digits typed and no match
  const handleCustQueryChange = (val) => {
    setCustQuery(val);
    setCustomer(null);
    setShowCustDD(true);
    if (val.length === 10 && /^\d{10}$/.test(val)) {
      const match = state.customers.find(c => c.phone === val);
      if (!match) {
        setShowCustDD(false);
        setShowAddCustomer(true);
      }
    }
  };

  const handleSaveNewCustomer = (form) => {
    dispatch({ type: 'ADD_CUSTOMER', payload: form });
    setCustomer(form); 
    setCustomerAddress(form.address || '');
    setCustQuery('');
    setShowAddCustomer(false);
  };

  const selectCustomer = (selectedCustomer) => {
    setCustomer(selectedCustomer);
    setCustomerAddress(selectedCustomer.address || '');
    setGstin(selectedCustomer.gstin || '');
    setCustQuery('');
    setShowCustDD(false);
  };

  // ── Product search — starts-with first, then contains ────────────────────
  const prodResultsRaw = prodQuery.length > 0
    ? state.products.filter(p =>
        p.name.toLowerCase().includes(prodQuery.toLowerCase()) ||
        (p.hsn || '').includes(prodQuery)
      )
    : [];

  // Sort: items that START WITH the query appear at the top
  const prodResults = prodResultsRaw
    .sort((a, b) => {
      const q = prodQuery.toLowerCase();
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 10);

  // ── Add product to cart ───────────────────────────────────────────────────
  const addProduct = (product) => {
    const selectedBatch = (product.batches || []).find(isSellableBatch);
    if (!selectedBatch) {
      alert(`No batch stock is available for ${product.name}`);
      return;
    }

    const existing = cart.findIndex(
      row => row.product.id === product.id && row.batchId === selectedBatch.id
    );
    if (existing > -1) {
      const updated = [...cart];
      updated[existing] = {
        ...updated[existing],
        qty: Math.min(updated[existing].qty + 1, Number(selectedBatch.stock)),
      };
      setCart(updated);
    } else {
      setCart(prev => [...prev, {
        product,
        batchId: selectedBatch.id,
        batch: selectedBatch.batch,
        expiry: selectedBatch.expiry,
        maxStock: Number(selectedBatch.stock),
        qty:  1,
        rate: selectedBatch.rate ?? product.rate,
        discPercent: 0,
        cgst: selectedBatch.cgst ?? product.cgst,
        sgst: selectedBatch.sgst ?? product.sgst,
      }]);
    }
    setProdQuery('');
    setShowProdDD(false);
  };

  const updateRow = (idx, row) => setCart(c => c.map((r, i) => i === idx ? row : r));
  const removeRow = (idx)      => setCart(c => c.filter((_, i) => i !== idx));

  // ── Save and auto-show print bill ─────────────────────────────────────────
  const handleSave = async () => {
    if (!cart.length) return alert('Add at least one product');
    const invalidItem = cart.find(item => !item.batchId || item.qty > item.maxStock);
    if (invalidItem) {
      return alert(`Select a valid batch and quantity for ${invalidItem.product.name}`);
    }
    
    try {
      const billId = await nextDocumentNo('sale');
      setInvoiceNo(billId);
      const amountPaid = paymentMode === 'full'
        ? totals.grandTotal
        : Math.min(totals.grandTotal, Math.max(0, Number(amountPaidInput) || 0));
      const dueAmount = round2(Math.max(0, totals.grandTotal - amountPaid));
      const paymentStatus = dueAmount <= 0.009 ? 'Fully Paid' : (amountPaid > 0 ? 'Partial' : 'Unpaid');
      const invoice = {
        id:       billId,
        date:     dayjs().format('DD-MM-YYYY'),
        createdAt: Date.now(),
        customer: customer?.name || 'Walk-in Customer',
        customerId: customer?.id || null,
        amount:   totals.grandTotal,
        tax:      totals.totalTax,
        status:   dueAmount <= 0.009 ? 'Paid' : (amountPaid > 0 ? 'Pending' : 'Unpaid'),
        type:     'sale',
        items:    totals.rows,
        gstin:    gstin || customer?.gstin || '',
        discount: totals.totalDiscount || 0,
        patient: patient.trim(),
        doctor: doctor.trim(),
        customerAddress: customerAddress.trim(),
        amountPaid,
        dueAmount,
        paymentStatus,
        paymentMethod,
      };

      const saved = await dispatch({ type: 'ADD_INVOICE', payload: invoice });
      setSavedInvoice(saved);
      if (onSaved) onSaved(saved);
    } catch (error) {
      alert(error.message || 'Failed to save invoice');
    }
  };

  // ── Start fresh after print/close ─────────────────────────────────────────
  const handleNewBill = () => {
    setSavedInvoice(null);
    setCart([]);
    setCustomer(null);
    setCustQuery('');
    setGstin('');
    setPatient('');
    setDoctor('');
    setCustomerAddress('');
    setPaymentMode('full');
    setAmountPaidInput('');
    setPaymentMethod('Cash');
    setInvoiceNo(saleNumberPreview());
  };

  return (
    <div className="space-y-5">
      <div className="panel flex items-center justify-between py-3 px-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Standard Invoice</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">
            Bill No: <span className="text-primary-700">{invoiceNo}</span>
            <span className="text-slate-400 font-normal"> · {dayjs().format('DD-MM-YYYY')}</span>
          </p>
        </div>
      </div>

      <div className="panel grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Patient Name</label>
          <input
            type="text"
            value={patient}
            onChange={event => setPatient(event.target.value)}
            placeholder="Enter patient name"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Doctor Name</label>
          <input
            type="text"
            value={doctor}
            onChange={event => setDoctor(event.target.value)}
            placeholder="Enter prescribing doctor"
            className="form-input"
          />
        </div>
      </div>

      {/* ── Customer + Product selectors ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Customer selector */}
        <div className="relative">
          <label className="form-label">Search / Select Customer</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={customer ? customer.name : custQuery}
              onChange={e => handleCustQueryChange(e.target.value)}
              onFocus={() => setShowCustDD(true)}
              onBlur={() => setTimeout(() => setShowCustDD(false), 150)}
              placeholder="Search by name or phone..."
              className="form-input pl-9"
            />
          </div>
          {showCustDD && custResults.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl
                            shadow-lg border border-surface-border overflow-hidden animate-fade-in">
              {custResults.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => selectCustomer(c)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50
                             text-sm border-b border-surface-border last:border-0 text-left"
                >
                  <span className="font-medium text-slate-700">{c.name}</span>
                  <span className="text-slate-400 text-xs">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product search with starts-with suggestions */}
        <div className="relative">
          <label className="form-label">Search &amp; Add Product / Medicine</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={prodQuery}
              onChange={e => { setProdQuery(e.target.value); setShowProdDD(true); }}
              onFocus={() => { if (prodQuery) setShowProdDD(true); }}
              onBlur={() => setTimeout(() => setShowProdDD(false), 150)}
              placeholder="Type any letter to search medicines..."
              className="form-input pl-9"
            />
          </div>

          {showProdDD && prodResults.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl
                            shadow-lg border border-surface-border overflow-hidden animate-fade-in max-h-72 overflow-y-auto">
              {prodResults.map(p => {
                const q = prodQuery.toLowerCase();
                const nameStarts = p.name.toLowerCase().startsWith(q);
                const sellableBatches = (p.batches || []).filter(isSellableBatch);
                const sellableStock = sellableBatches.reduce(
                  (sum, batch) => sum + Number(batch.stock || 0),
                  0
                );
                return (
                  <button
                    key={p.id}
                    onMouseDown={() => addProduct(p)}
                    disabled={sellableStock === 0}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-2.5',
                      'text-sm border-b border-surface-border last:border-0 text-left transition-colors',
                      sellableStock === 0
                        ? 'opacity-40 cursor-not-allowed bg-slate-50'
                        : 'hover:bg-primary-50 cursor-pointer'
                    )}
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {/* Highlight the matched prefix */}
                        {nameStarts ? (
                          <>
                            <span className="text-primary-600 font-bold">{p.name.slice(0, prodQuery.length)}</span>
                            <span>{p.name.slice(prodQuery.length)}</span>
                          </>
                        ) : (
                          p.name
                        )}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        HSN: {p.hsn}
                        {p.batches?.length ? ` · ${sellableBatches.length} sellable batch(es)` : ''}
                        {p.grams ? ` · ${p.grams}` : ''}
                        {` · Stock: `}
                        <span className={p.stock <= (p.minStock || 10) ? 'text-danger font-semibold' : 'text-success font-semibold'}>
                          {sellableStock}
                        </span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-primary-600 font-bold text-sm">₹{p.rate}</p>
                      <p className="text-xs text-slate-400">MRP ₹{p.mrp}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {showProdDD && prodQuery.length > 0 && prodResults.length === 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl
                            shadow-lg border border-surface-border px-4 py-3 text-sm text-slate-400 animate-fade-in">
              No products found for &quot;{prodQuery}&quot;
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="form-label">Customer Address</label>
        <textarea
          value={customerAddress}
          onChange={event => setCustomerAddress(event.target.value)}
          placeholder="Enter customer billing address"
          className="form-input"
          rows={2}
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Automatically filled when a saved customer is selected and included on the printed bill.
        </p>
      </div>

      {/* ── Selected Customer badge ── */}
      {customer && (
        <div className="flex items-start gap-4 px-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm animate-fade-in">
          <UserPlus className="w-4 h-4 text-primary-500 mt-0.5" />
          <div className="min-w-0">
            <span className="font-medium text-primary-700">{customer.name}</span>
            <span className="text-primary-500 ml-4">{customer.phone}</span>
            {customer.gstin && <span className="text-xs text-primary-400 ml-4">GSTIN: {customer.gstin}</span>}
            {customerAddress && <p className="text-xs text-primary-500 mt-1">{customerAddress}</p>}
            <p className={`text-xs font-bold mt-1.5 ${customerDue > 0 ? 'text-danger' : 'text-success'}`}>
              Previous Due: ₹{customerDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button
            onClick={() => {
              setCustomer(null);
              setCustomerAddress('');
              setGstin('');
            }}
            className="ml-auto text-primary-400 hover:text-primary-600 text-xs"
          >
            Change
          </button>
        </div>
      )}

      {/* ── Product grid ── */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Manufacturer</th>
                <th>HSN Code</th>
                <th>Batch / Expiry</th>
                <th>Quantity</th>
                <th>Sale Rate</th>
                <th>Disc %</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Search and add products above to begin billing
                  </td>
                </tr>
              ) : (
                cart.map((row, i) => (
                  <ProductRow
                    key={i}
                    row={row}
                    index={i}
                    onUpdate={updateRow}
                    onRemove={removeRow}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Summary ── */}
      {cart.length > 0 && (
        <div className="flex justify-end animate-fade-in">
          <div className="w-full max-w-sm">
            <InvoiceSummary
              totals={totals}
              gstin={gstin}
              onGstinChange={setGstin}
              onSave={handleSave}
              onCancel={() => { setCart([]); setCustomer(null); setPaymentMode('full'); setAmountPaidInput(''); setPaymentMethod('Cash'); }}
              showPayment
              paymentMode={paymentMode}
              onPaymentModeChange={(mode) => {
                setPaymentMode(mode);
                if (mode === 'partial') setAmountPaidInput(String(totals.grandTotal));
                else setAmountPaidInput('');
              }}
              amountPaidInput={amountPaidInput}
              onAmountPaidChange={setAmountPaidInput}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
            />
          </div>
        </div>
      )}

      {/* ── Auto Print Bill Popup ── */}
      {savedInvoice && (
        <PrintBillModal
          invoice={savedInvoice}
          onClose={handleNewBill}
          onNewBill={handleNewBill}
        />
      )}

      {/* ── Add Customer Popup ── */}
      {showAddCustomer && (
        <AddCustomerModal 
          initialPhone={custQuery}
          onSave={handleSaveNewCustomer} 
          onClose={() => setShowAddCustomer(false)} 
        />
      )}
    </div>
  );
}
