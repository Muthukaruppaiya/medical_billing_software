import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { nextDocumentNo } from '../../hooks/useInvoice';
import PurchaseRow from './PurchaseRow';
import PrintPurchaseModal from './PrintPurchaseModal';
import { PAYMENT_METHODS } from '../billing/InvoiceSummary';
import { Search, Save, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { calcPurchaseLine, calcPurchaseSummary, round2 } from '../../utils/money';

export default function PurchaseInvoice({ onSaved }) {
  const { state, dispatch } = useApp();
  const [supplier, setSupplier]     = useState(null);
  const [supQuery, setSupQuery]     = useState('');
  const [showSupDD, setShowSupDD]   = useState(false);
  const [prodQuery, setProdQuery]   = useState('');
  const [showProdDD, setShowProdDD] = useState(false);
  const [prodResults, setProdResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [cart, setCart]             = useState([]);
  const [savedPurchase, setSavedPurchase] = useState(null);
  const [cashDiscPercent, setCashDiscPercent] = useState(0);
  const [paymentMode, setPaymentMode] = useState('full');
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [invoiceNo, setInvoiceNo]   = useState(() => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `PO${yy}${mm}…`;
  });

  const summaryRows = useMemo(
    () => cart.map(row => ({
      qty: row.qty,
      rate: row.rate,
      value: Number(row.value) > 0 ? row.value : round2(Number(row.qty) * Number(row.rate)),
      discount: row.discount || 0,
      tax: row.tax || ((Number(row.cgst) || 0) + (Number(row.sgst) || 0)),
    })),
    [cart]
  );
  const summary = useMemo(
    () => calcPurchaseSummary(summaryRows, cashDiscPercent),
    [summaryRows, cashDiscPercent]
  );
  const amountPaid = paymentMode === 'full'
    ? summary.netAmount
    : Math.min(summary.netAmount, Math.max(0, Number(amountPaidInput) || 0));
  const dueAmount = round2(Math.max(0, summary.netAmount - amountPaid));
  const paymentStatus = dueAmount <= 0.009 ? 'Fully Paid' : (amountPaid > 0 ? 'Partial' : 'Unpaid');

  useEffect(() => {
    const query = prodQuery.trim();
    if (query.length < 2) {
      setProdResults([]);
      setSearchingProducts(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(query)}&limit=20`,
          { signal: controller.signal }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Product search failed');
        setProdResults(data);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to search medicine catalog:', error);
          setProdResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearchingProducts(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [prodQuery]);

  const addProduct = (product) => {
    const gst = (Number(product.cgst) || 0) + (Number(product.sgst) || 0);
    const rate = product.purchaseRate ?? product.rate ?? 0;
    setCart(prev => [...prev, {
      product,
      manufacturer: product.manufacturer || '',
      rack: product.rackLocation || '',
      batch: product.batch || '',
      expiry: product.expiry || '',
      hsn: product.hsn || '',
      pack: product.grams || '',
      mrp: product.mrp || 0,
      qty: 1,
      free: 0,
      rate,
      oldMrp: 0,
      discount: 0,
      value: round2(rate),
      tax: gst || 5,
      cgst: (gst || 5) / 2,
      sgst: (gst || 5) / 2,
      saleRate: product.rate ?? product.mrp ?? 0,
    }]);
    setProdQuery('');
    setShowProdDD(false);
  };

  const updateRow = (idx, row) => setCart(c => c.map((r, i) => i === idx ? row : r));
  const removeRow = (idx)      => setCart(c => c.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!cart.length) return alert('Add at least one product');
    if (!supplier) return alert('Select a supplier');
    const missingBatch = cart.find(item => !item.batch?.trim());
    if (missingBatch) return alert(`Enter a batch number for ${missingBatch.product.name}`);

    setSaving(true);
    try {
      const poId = await nextDocumentNo('purchase');
      setInvoiceNo(poId);
      const items = cart.map((row, index) => {
        const line = summary.lines[index] || calcPurchaseLine(summaryRows[index]);
        const gst = Number(row.tax) || 0;
        return {
          product: { id: row.product.id, name: row.product.name },
          manufacturer: row.manufacturer || '',
          rack: row.rack || '',
          batch: row.batch.trim(),
          expiry: row.expiry || '',
          hsn: row.hsn || row.product.hsn || '',
          pack: row.pack || '',
          mrp: Number(row.mrp) || 0,
          qty: Number(row.qty) || 0,
          free: Number(row.free) || 0,
          rate: Number(row.rate) || 0,
          oldMrp: Number(row.oldMrp) || 0,
          discount: Number(row.discount) || 0,
          discAmt: line.discAmt,
          gstPercent: gst,
          gstAmt: line.gstAmt,
          cgst: gst / 2,
          sgst: gst / 2,
          saleRate: Number(row.saleRate) || Number(row.mrp) || Number(row.rate) || 0,
          lineAmt: line.gross,
          taxable: line.taxableFinal ?? line.taxable,
          total: line.net,
        };
      });

      const purchase = {
        id: poId,
        date: dayjs().format('DD-MM-YYYY'),
        supplier: supplier.name,
        supplierId: supplier.id,
        supplierAddress: supplier.address || '',
        supplierPhone: supplier.phone || '',
        supplierGstin: supplier.gstin || '',
        supplierPan: supplier.pan || '',
        supplierDrugLicense: supplier.drugLicense || '',
        amount: summary.netAmount,
        goodsValue: summary.goodsValue,
        discountAmount: summary.totalDisc,
        taxAmount: summary.totalGst,
        roundOff: summary.roundOff,
        cashDiscPercent: summary.cashDiscPercent,
        amountPaid,
        dueAmount,
        paymentStatus,
        paymentMethod,
        status: 'Received',
        items,
      };
      const saved = await dispatch({ type: 'ADD_PURCHASE', payload: purchase });
      setSavedPurchase(saved);
      if (onSaved) onSaved(saved);
    } catch (error) {
      alert(error.message || 'Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  const resetAfterSave = () => {
    setSavedPurchase(null);
    setCart([]);
    setSupplier(null);
    setSupQuery('');
    setCashDiscPercent(0);
    setPaymentMode('full');
    setAmountPaidInput('');
    setPaymentMethod('Cash');
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    setInvoiceNo(`PO${yy}${mm}…`);
  };

  return (
    <div className="space-y-5">
      <div className="panel flex items-center justify-between py-3 px-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Manual Purchase</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">
            PO # <span className="text-primary-700">{invoiceNo}</span>
            <span className="text-slate-400 font-normal"> · {dayjs().format('DD-MM-YYYY')}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <label className="form-label">Select Supplier</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={supplier ? supplier.name : supQuery}
              onChange={e => { setSupQuery(e.target.value); setSupplier(null); setShowSupDD(true); }}
              onFocus={() => setShowSupDD(true)}
              onBlur={() => setTimeout(() => setShowSupDD(false), 150)}
              placeholder="Search supplier..."
              className="form-input pl-9"
            />
          </div>
          {showSupDD && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl
                            shadow-lg border border-surface-border overflow-hidden animate-fade-in">
              {state.suppliers
                .filter(s =>
                  s.name.toLowerCase().includes(supQuery.toLowerCase()) ||
                  (s.phone || '').includes(supQuery) ||
                  (s.gstin || '').toLowerCase().includes(supQuery.toLowerCase())
                )
                .map(s => (
                <button
                  key={s.id}
                  onMouseDown={() => {
                    setSupplier(s);
                    setSupQuery('');
                    setShowSupDD(false);
                  }}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50
                             text-sm border-b border-surface-border last:border-0 text-left"
                >
                  <span className="font-medium text-slate-700">{s.name}</span>
                  <span className="text-slate-400 text-xs">{s.phone}</span>
                </button>
              ))}
              {state.suppliers.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-400">
                  No suppliers maintained. Add one from the Suppliers page.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="form-label">Search & Add Medicine / Product</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={prodQuery}
              onChange={e => { setProdQuery(e.target.value); setShowProdDD(true); }}
              onFocus={() => setShowProdDD(true)}
              onBlur={() => setTimeout(() => setShowProdDD(false), 150)}
              placeholder="Search by name or HSN code..."
              className="form-input pl-9"
            />
          </div>
          {showProdDD && prodQuery.trim().length >= 2 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl
                            shadow-lg border border-surface-border overflow-hidden animate-fade-in max-h-72 overflow-y-auto">
              {searchingProducts && (
                <div className="px-4 py-3 text-sm text-slate-400">Searching medicine catalog...</div>
              )}
              {!searchingProducts && prodResults.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-400">No medicines found</div>
              )}
              {!searchingProducts && prodResults.map(p => (
                <button
                  key={p.id}
                  onMouseDown={() => addProduct(p)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50
                             text-sm border-b border-surface-border last:border-0 text-left"
                >
                  <div>
                    <p className="font-medium text-slate-700">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {p.isCatalog
                        ? 'Medicine catalog · Enter batch, purchase rate, MRP and stock'
                        : `HSN: ${p.hsn || '-'} · MRP: ₹${p.mrp || 0}`}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${p.isCatalog ? 'text-amber-600' : 'text-primary-600'}`}>
                    {p.isCatalog ? 'NEW STOCK' : `₹${p.rate || 0}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {supplier && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1 break-words">
              <p className="font-bold text-teal-900">{supplier.name}</p>
              {supplier.address && (
                <p className="text-xs text-teal-700 whitespace-pre-line">{supplier.address}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-teal-800">
                {supplier.phone && <span>Phone: {supplier.phone}</span>}
                {supplier.gstin && <span>GSTIN: {supplier.gstin}</span>}
                {supplier.pan && <span>PAN: {supplier.pan}</span>}
                {supplier.drugLicense && <span>DL No: {supplier.drugLicense}</span>}
              </div>
            </div>
            <button onClick={() => setSupplier(null)} className="text-teal-400 hover:text-teal-600 text-xs shrink-0">
              Change
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table text-xs min-w-[1400px]">
            <thead>
              <tr>
                <th>MFR</th>
                <th>RACK</th>
                <th>BATCH</th>
                <th>EXP</th>
                <th>HSN</th>
                <th>PRODUCT NAME</th>
                <th>PACK</th>
                <th>MRP</th>
                <th>QTY</th>
                <th>FREE</th>
                <th>RATE</th>
                <th>Old MRP</th>
                <th>Disc%</th>
                <th>Amount</th>
                <th>GST%</th>
                <th>Tax Amt</th>
                <th>Sale Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={18} className="text-center py-12 text-slate-400">
                    Search and add products above to begin purchase entry
                  </td>
                </tr>
              ) : (
                cart.map((row, i) => (
                  <PurchaseRow key={i} row={row} index={i} onUpdate={updateRow} onRemove={removeRow} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cart.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
          <div className="card space-y-3">
            <p className="text-sm font-bold text-slate-800">Bill Summary</p>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
              <div className="flex justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-slate-600">Goods Value</span>
                <span className="font-semibold">{summary.goodsValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                <span className="text-slate-600">
                  C.Disc % {summary.cashDiscPercent || 0}
                  {summary.lineDisc > 0 ? ' + line Disc%' : ''}
                </span>
                <span className="font-semibold text-danger">-{summary.totalDisc.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                <span className="text-slate-600">Total Disc</span>
                <span className="font-semibold">{summary.totalDisc.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                <span className="text-slate-600">GST (Tax Amt)</span>
                <span className="font-semibold text-primary-700">{summary.totalGst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                <span className="text-slate-600">Rounded off</span>
                <span className="font-semibold">{summary.roundOff.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-teal-50 border-t-2 border-teal-600">
                <span className="font-extrabold text-slate-800">NET AMOUNT</span>
                <span className="font-extrabold text-teal-700 text-lg">{summary.netAmount.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <label className="form-label">Cash Discount % (bill level)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={cashDiscPercent || ''}
                onChange={e => setCashDiscPercent(Math.max(0, Number(e.target.value) || 0))}
                placeholder="e.g. 4"
                className="form-input w-40"
              />
            </div>
          </div>

          <div className="card space-y-4">
            <p className="text-sm font-bold text-slate-800">Mode of Payment</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPaymentMode('full'); setAmountPaidInput(''); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${
                  paymentMode === 'full'
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-slate-600 border-surface-border'
                }`}
              >
                Fully Paid
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('partial');
                  setAmountPaidInput(String(summary.netAmount));
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${
                  paymentMode === 'partial'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-600 border-surface-border'
                }`}
              >
                Partial / Due
              </button>
            </div>
            <div>
              <label className="form-label">Payment Method</label>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-1 rounded-lg text-[11px] font-bold border ${
                      paymentMethod === method
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-surface-border'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
            {paymentMode === 'partial' && (
              <div>
                <label className="form-label">Amount Paid Now (₹)</label>
                <input
                  type="number"
                  min="0"
                  max={summary.netAmount}
                  step="0.01"
                  value={amountPaidInput}
                  onChange={e => setAmountPaidInput(e.target.value)}
                  className="form-input"
                />
              </div>
            )}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Paid</span>
                <span className="font-semibold">₹{amountPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Due</span>
                <span className={`font-bold ${dueAmount > 0 ? 'text-danger' : 'text-success'}`}>
                  ₹{dueAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500">Status</span>
                <span className="font-semibold text-slate-800">{paymentMethod} · {paymentStatus}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-success w-full justify-center gap-2 py-3 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Purchase'}
            </button>
          </div>
        </div>
      )}

      {savedPurchase && (
        <PrintPurchaseModal
          purchase={savedPurchase}
          onClose={resetAfterSave}
          onNewPurchase={resetAfterSave}
        />
      )}
    </div>
  );
}
