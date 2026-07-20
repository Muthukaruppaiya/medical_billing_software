import { normalizeExpiry, MONTH_NAMES, yearOptions } from '../../utils/expiry';

/**
 * Month + year only expiry control (MM/YY). No calendar day.
 */
export default function ExpiryInput({
  value,
  onChange,
  className = 'form-input',
  required = false,
  disabled = false,
}) {
  const normalized = normalizeExpiry(value);
  const [month, year] = normalized ? normalized.split('/') : ['', ''];
  const years = yearOptions(20);

  const emit = (nextMonth, nextYear) => {
    if (!nextMonth || !nextYear) {
      onChange('');
      return;
    }
    onChange(`${nextMonth}/${nextYear}`);
  };

  return (
    <div className={`flex items-center gap-1 ${disabled ? 'opacity-60' : ''}`}>
      <select
        value={month}
        required={required}
        disabled={disabled}
        onChange={event => emit(event.target.value, year || years[0])}
        className={className}
        title="Expiry month"
      >
        <option value="">MM</option>
        {MONTH_NAMES.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <span className="text-slate-400 text-xs font-semibold">/</span>
      <select
        value={year}
        required={required}
        disabled={disabled}
        onChange={event => emit(month || '01', event.target.value)}
        className={className}
        title="Expiry year"
      >
        <option value="">YY</option>
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
