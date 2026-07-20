import { Minus, Plus, Trash2 } from 'lucide-react';
import ExpiryInput from '../ui/ExpiryInput';

export default function PurchaseRow({ row, index, onUpdate, onRemove }) {
  const { product, qty, rate, saleRate, cgst, sgst, batch, expiry, mrp } = row;
  const lineAmt = qty * rate;
  const cgstAmt = (lineAmt * cgst) / 100;
  const sgstAmt = (lineAmt * sgst) / 100;
  const total   = lineAmt + cgstAmt + sgstAmt;

  const set = (field, val) => onUpdate(index, { ...row, [field]: val });

  return (
    <tr>
      <td className="px-3 py-2">
        <p className="font-medium text-slate-700 text-sm whitespace-nowrap">{product.name}</p>
        <p className="text-xs text-slate-400">{product.category}</p>
      </td>
      <td className="px-3 py-2 text-sm text-slate-500">{product.hsn}</td>

      {/* Batch */}
      <td className="px-3 py-2">
        <input
          type="text"
          value={batch}
          onChange={e => set('batch', e.target.value)}
          className="form-input w-20 text-sm"
          placeholder="Batch"
          required
        />
      </td>

      {/* EXP MM/YY */}
      <td className="px-3 py-2">
        <ExpiryInput
          value={expiry}
          onChange={value => set('expiry', value)}
          className="form-input w-16 text-sm"
        />
      </td>

      {/* Qty */}
      <td className="px-3 py-2">
        <div className="qty-stepper w-max">
          <button onClick={() => set('qty', Math.max(1, qty - 1))}>
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={e => set('qty', Math.max(1, Number(e.target.value)))}
          />
          <button onClick={() => set('qty', qty + 1)}>
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

      {/* Sale Rate */}
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
          <input
            type="number"
            min="0"
            value={saleRate}
            onChange={e => set('saleRate', Math.max(0, Number(e.target.value)))}
            className="form-input pl-5 w-24 text-sm"
          />
        </div>
      </td>

      {/* MRP */}
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
          <input
            type="number"
            value={mrp}
            onChange={e => set('mrp', Number(e.target.value))}
            className="form-input pl-5 w-24 text-sm"
          />
        </div>
      </td>

      {/* Tax */}
      <td className="px-3 py-2 text-xs text-slate-600">
        <span>{cgst}% + {sgst}%</span>
        <p className="text-slate-400">₹{(cgstAmt + sgstAmt).toFixed(2)}</p>
      </td>

      {/* Total */}
      <td className="px-3 py-2 font-semibold text-slate-800">₹{total.toFixed(2)}</td>

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
