import { Save, X, Printer } from 'lucide-react';
import { fmt } from '../../hooks/useInvoice';

export default function InvoiceSummary({
  totals,
  gstin,
  onGstinChange,
  onSave,
  onCancel,
  onPrint,
  discount = 0,
  discountType = '%',
  onDiscountChange,
  onDiscountTypeChange
}) {
  const { subtotal } = totals;

  const discountVal = Number(discount) || 0;
  const discountAmt = discountType === '%' 
    ? (subtotal * discountVal) / 100 
    : discountVal;
  
  const finalGrandTotal = Math.max(0, subtotal - discountAmt);

  return (
    <div className="bg-slate-50 border border-surface-border rounded-xl p-5 space-y-3">
      {/* Breakdown — TAX TEMPORARILY DISABLED */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="font-medium">{fmt(subtotal)}</span>
        </div>

        {discountAmt > 0 && (
          <div className="flex justify-between text-sm text-danger font-medium">
            <span>Discount ({discountType === '%' ? `${discountVal}%` : 'Fixed'})</span>
            <span>-{fmt(discountAmt)}</span>
          </div>
        )}

        <div className="h-px bg-surface-border" />
        <div className="flex justify-between text-base font-bold text-slate-800">
          <span>Grand Total</span>
          <span className="text-primary-600 text-lg">{fmt(finalGrandTotal)}</span>
        </div>
      </div>

      {/* Discount input (Only rendered if handler is provided) */}
      {onDiscountChange && (
        <div className="space-y-1">
          <label className="form-label text-xs">Apply Discount</label>
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-surface-border overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => onDiscountTypeChange('%')}
                className={`px-3 text-xs font-bold transition-colors ${
                  discountType === '%' ? 'bg-primary-500 text-white' : 'hover:bg-slate-50 text-slate-500'
                }`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => onDiscountTypeChange('₹')}
                className={`px-3 text-xs font-bold transition-colors ${
                  discountType === '₹' ? 'bg-primary-500 text-white' : 'hover:bg-slate-50 text-slate-500'
                }`}
              >
                ₹
              </button>
            </div>
            <input
              type="number"
              min="0"
              value={discount || ''}
              onChange={e => onDiscountChange(Math.max(0, Number(e.target.value)))}
              placeholder={discountType === '%' ? 'e.g. 10' : 'e.g. 50'}
              className="form-input text-sm flex-1"
            />
          </div>
        </div>
      )}



      {/* GSTIN input */}
      <div>
        <label className="form-label">Customer GSTIN (Optional)</label>
        <input
          type="text"
          value={gstin}
          onChange={e => onGstinChange(e.target.value)}
          placeholder="27AABCX1234X1Z5"
          className="form-input uppercase text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="btn-success flex-1 justify-center">
          <Save className="w-4 h-4" />
          Save Invoice
        </button>
        {onPrint && (
          <button onClick={onPrint} className="btn-secondary px-3">
            <Printer className="w-4 h-4" />
          </button>
        )}
        <button onClick={onCancel} className="btn-secondary px-4">
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
