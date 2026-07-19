import { useEffect, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useInvoice, genInvoiceNo } from '../../hooks/useInvoice';
import PurchaseRow from './PurchaseRow';
import InvoiceSummary from '../billing/InvoiceSummary';
import { Search } from 'lucide-react';
import dayjs from 'dayjs';

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
  const [gstin, setGstin]           = useState('');
  const invoiceNo = useRef(genInvoiceNo('PUR'));

  const totals = useInvoice(cart);

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
    setCart(prev => [...prev, {
      product,
      qty:    1,
      rate:   product.rate,
      mrp:    product.mrp,
      cgst:   product.cgst,
      sgst:   product.sgst,
      batch:  product.batch || '',
      expiry: product.expiry || '',
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

    const purchase = {
      id:       invoiceNo.current,
      date:     dayjs().format('DD-MM-YYYY'),
      supplier: supplier.name,
      supplierId: supplier.id,
      amount:   totals.grandTotal,
      status:   'Received',
      items:    totals.rows,
    };
    try {
      const savedPurchase = await dispatch({ type: 'ADD_PURCHASE', payload: purchase });
      if (onSaved) onSaved(savedPurchase);
      else {
        alert(`Purchase ${invoiceNo.current} saved!`);
        setCart([]);
        setSupplier(null);
        invoiceNo.current = genInvoiceNo('PUR');
      }
    } catch (error) {
      alert(error.message || 'Failed to save purchase');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">New Purchase</h1>
          <p className="text-xs text-slate-400">PO # {invoiceNo.current} &nbsp;·&nbsp; {dayjs().format('DD-MM-YYYY')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Supplier selector */}
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
                    setGstin(s.gstin || '');
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

        {/* Product search */}
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
        <div className="flex items-center gap-4 px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-sm animate-fade-in">
          <span className="font-medium text-teal-700">{supplier.name}</span>
          <span className="text-teal-500">{supplier.phone}</span>
          {supplier.gstin && (
            <span className="text-xs text-teal-500">GSTIN: {supplier.gstin}</span>
          )}
          <button onClick={() => setSupplier(null)} className="ml-auto text-teal-400 hover:text-teal-600 text-xs">Change</button>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>HSN</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Quantity</th>
                <th>Purchase Rate</th>
                <th>MRP</th>
                <th>Tax</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
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
        <div className="flex justify-end animate-fade-in">
          <div className="w-full max-w-sm">
            <InvoiceSummary
              totals={totals}
              gstin={gstin}
              onGstinChange={setGstin}
              onSave={handleSave}
              onCancel={() => { setCart([]); setSupplier(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
