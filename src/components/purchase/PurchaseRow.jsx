import { Trash2 } from 'lucide-react';
import ExpiryInput from '../ui/ExpiryInput';
import { calcPurchaseLine, round2 } from '../../utils/money';

export default function PurchaseRow({ row, index, onUpdate, onRemove }) {
  const {
    product,
    manufacturer = '',
    rack = '',
    batch = '',
    expiry = '',
    hsn = '',
    pack = '',
    mrp = 0,
    qty = 1,
    free = 0,
    rate = 0,
    oldMrp = 0,
    discount = 0,
    tax = 0,
    saleRate = 0,
  } = row;

  const value = round2(Number(row.value) > 0 ? row.value : Number(qty) * Number(rate));
  const line = calcPurchaseLine({ ...row, value, discount, tax });

  const set = (field, val) => {
    const next = { ...row, [field]: val };
    // Keep Amount in sync with qty × rate unless user is editing value directly
    if (field === 'qty' || field === 'rate') {
      const q = field === 'qty' ? Number(val) : Number(next.qty) || 0;
      const r = field === 'rate' ? Number(val) : Number(next.rate) || 0;
      next.value = round2(q * r);
    }
    if (field === 'tax') {
      const gst = Math.max(0, Number(val) || 0);
      next.cgst = gst / 2;
      next.sgst = gst / 2;
    }
    onUpdate(index, next);
  };

  return (
    <tr>
      <td className="px-2 py-2">
        <input
          type="text"
          value={manufacturer}
          onChange={e => set('manufacturer', e.target.value)}
          className="form-input text-xs w-16"
          placeholder="MFR"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="text"
          value={rack}
          onChange={e => set('rack', e.target.value)}
          className="form-input text-xs w-14"
          placeholder="Rack"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="text"
          value={batch}
          onChange={e => set('batch', e.target.value)}
          className="form-input text-xs w-24"
          placeholder="Batch"
          required
        />
      </td>
      <td className="px-2 py-2">
        <ExpiryInput
          value={expiry}
          onChange={value => set('expiry', value)}
          className="form-input text-xs w-16"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="text"
          value={hsn || product?.hsn || ''}
          onChange={e => set('hsn', e.target.value)}
          className="form-input text-xs w-20"
          placeholder="HSN"
        />
      </td>
      <td className="px-2 py-2 min-w-[10rem]">
        <p className="font-medium text-slate-700 text-xs">{product?.name}</p>
        <p className="text-[10px] text-slate-400">{product?.category}</p>
      </td>
      <td className="px-2 py-2">
        <input
          type="text"
          value={pack}
          onChange={e => set('pack', e.target.value)}
          className="form-input text-xs w-14"
          placeholder="Pack"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={mrp}
          onChange={e => set('mrp', Number(e.target.value))}
          className="form-input text-xs w-20"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="1"
          value={qty}
          onChange={e => set('qty', Math.max(1, Number(e.target.value) || 1))}
          className="form-input text-xs w-14"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          value={free}
          onChange={e => set('free', Math.max(0, Number(e.target.value) || 0))}
          className="form-input text-xs w-14"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={rate}
          onChange={e => set('rate', Number(e.target.value))}
          className="form-input text-xs w-20"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={oldMrp}
          onChange={e => set('oldMrp', Number(e.target.value))}
          className="form-input text-xs w-20"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={discount || ''}
          onChange={e => set('discount', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          placeholder="0"
          className="form-input text-xs w-14"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={e => set('value', Number(e.target.value))}
          className="form-input text-xs w-20"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          max="28"
          step="1"
          value={tax || ''}
          onChange={e => set('tax', Math.max(0, Number(e.target.value) || 0))}
          placeholder="0"
          className="form-input text-xs w-14"
        />
      </td>
      <td className="px-2 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
        ₹{line.gstAmt.toFixed(2)}
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={saleRate}
          onChange={e => set('saleRate', Math.max(0, Number(e.target.value) || 0))}
          className="form-input text-xs w-20"
          title="Sale rate for stock"
        />
      </td>
      <td className="px-2 py-2">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-danger"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
