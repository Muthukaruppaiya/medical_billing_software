import { Save, X, Printer } from 'lucide-react';
import { fmt } from '../../hooks/useInvoice';
import { round2 } from '../../utils/money';

export const PAYMENT_METHODS = ['Cash', 'GPay', 'PhonePe', 'Card', 'UPI', 'Bank Transfer', 'Credit'];

export default function InvoiceSummary({
  totals,
  gstin,
  onGstinChange,
  onSave,
  onCancel,
  onPrint,
  saveLabel = 'Save Invoice',
  gstinLabel = 'Customer GSTIN (Optional)',
  paymentMode = 'full',
  onPaymentModeChange,
  amountPaidInput = '',
  onAmountPaidChange,
  showPayment = false,
  paymentMethod = 'Cash',
  onPaymentMethodChange,
}) {
  const { subtotal, totalDiscount = 0, grandTotal } = totals;
  const amountPaid = !showPayment || paymentMode === 'full'
    ? grandTotal
    : Math.min(grandTotal, Math.max(0, Number(amountPaidInput) || 0));
  const dueAmount = round2(Math.max(0, grandTotal - amountPaid));

  return (
    <div className="panel space-y-3">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="font-medium">{fmt(subtotal)}</span>
        </div>

        {totalDiscount > 0 && (
          <div className="flex justify-between text-sm text-danger font-medium">
            <span>Line Discount</span>
            <span>-{fmt(totalDiscount)}</span>
          </div>
        )}

        <div className="h-px bg-surface-border" />
        <div className="flex justify-between text-base font-bold text-slate-800">
          <span>Grand Total</span>
          <span className="text-primary-600 text-lg">{fmt(grandTotal)}</span>
        </div>
      </div>

      {showPayment && onPaymentModeChange && (
        <div className="space-y-2">
          <label className="form-label">Mode of Payment</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPaymentModeChange('full')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                paymentMode === 'full'
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-white text-slate-600 border-surface-border'
              }`}
            >
              Fully Paid
            </button>
            <button
              type="button"
              onClick={() => onPaymentModeChange('partial')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                paymentMode === 'partial'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-600 border-surface-border'
              }`}
            >
              Partial / Due
            </button>
          </div>

          {onPaymentMethodChange && (
            <div>
              <label className="form-label">Payment Method</label>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => onPaymentMethodChange(method)}
                    className={`py-2 px-1 rounded-lg text-[11px] font-bold border transition-colors ${
                      paymentMethod === method
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-surface-border hover:bg-slate-50'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          )}

          {paymentMode === 'partial' && (
            <div>
              <label className="form-label">Amount Paid Now (₹)</label>
              <input
                type="number"
                min="0"
                max={grandTotal}
                step="0.01"
                value={amountPaidInput}
                onChange={e => onAmountPaidChange?.(e.target.value)}
                className="form-input"
              />
            </div>
          )}
          <div className="flex justify-between text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
            <span>Due after this bill</span>
            <span className={`font-bold ${dueAmount > 0 ? 'text-danger' : 'text-success'}`}>
              {fmt(dueAmount)}
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="form-label">{gstinLabel}</label>
        <input
          type="text"
          value={gstin}
          onChange={e => onGstinChange(e.target.value)}
          placeholder="27AABCX1234X1Z5"
          className="form-input uppercase text-sm"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="btn-success flex-1 justify-center">
          <Save className="w-4 h-4" />
          {saveLabel}
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
