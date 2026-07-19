import { Minus, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

export default function ProductRow({ row, index, onUpdate, onRemove }) {
  const { product, qty, rate, batchId, batch, expiry, maxStock } = row;
  const total = qty * rate; // TAX DISABLED

  const set = (field, val) => onUpdate(index, { ...row, [field]: val });
  const selectBatch = (value) => {
    const selected = product.batches?.find(item => item.id === Number(value));
    if (!selected) return;
    onUpdate(index, {
      ...row,
      batchId: selected.id,
      batch: selected.batch,
      expiry: selected.expiry,
      maxStock: Number(selected.stock),
      qty: Math.min(qty, Number(selected.stock)),
      rate: selected.rate ?? product.rate,
      cgst: selected.cgst ?? product.cgst,
      sgst: selected.sgst ?? product.sgst,
    });
  };

  return (
    <tr>
      {/* Product Name */}
      <td className="px-3 py-2">
        <p className="font-medium text-slate-700 text-sm whitespace-nowrap">{product.name}</p>
        <p className="text-xs text-slate-400">{product.category}</p>
      </td>

      {/* Manufacturer */}
      <td className="px-3 py-2 text-sm text-slate-500">
        {product.manufacturer || '-'}
      </td>

      {/* HSN */}
      <td className="px-3 py-2 text-sm text-slate-500">{product.hsn}</td>

      {/* Batch */}
      <td className="px-3 py-2">
        <select
          value={batchId}
          onChange={event => selectBatch(event.target.value)}
          className="form-input min-w-40 text-xs"
        >
          {(product.batches || [])
            .filter(item =>
              (Number(item.stock) > 0 &&
                (!item.expiry || !dayjs(item.expiry).isBefore(dayjs(), 'day'))) ||
              item.id === batchId
            )
            .map(item => (
              <option key={item.id} value={item.id}>
                {item.batch} · Exp {item.expiry || 'N/A'} · Stock {item.stock}
              </option>
            ))}
        </select>
        <p className="text-[10px] text-slate-400 mt-1">
          Selected: {batch} · {expiry || 'No expiry'}
        </p>
      </td>

      {/* Qty Stepper */}
      <td className="px-3 py-2">
        <div className="qty-stepper w-max">
          <button onClick={() => set('qty', Math.max(1, qty - 1))}>
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            min={1}
            max={maxStock}
            value={qty}
            onChange={e => set('qty', Math.min(maxStock, Math.max(1, Number(e.target.value))))}
          />
          <button onClick={() => set('qty', Math.min(maxStock, qty + 1))}>
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </td>

      {/* Rate */}
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
          <input
            type="number"
            value={rate}
            onChange={e => set('rate', Number(e.target.value))}
            className="form-input pl-5 w-24 text-sm"
          />
        </div>
      </td>

      {/* Tax (CGST / SGST) — TEMPORARILY HIDDEN */}
      {/* <td className="px-3 py-2"> ... </td> */}

      {/* Total */}
      <td className="px-3 py-2 font-semibold text-slate-800">
        ₹{total.toFixed(2)}
      </td>

      {/* Remove */}
      <td className="px-3 py-2">
        <button
          onClick={() => onRemove(index)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400
                     hover:bg-red-50 hover:text-danger transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
