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
  compact = false,
}) {
  const normalized = normalizeExpiry(value);
  const [month, year] = normalized ? normalized.split('/') : ['', ''];
  const years = yearOptions(20);
  // Keep selected year visible even if outside the generated range
  const yearList = year && !years.includes(year) ? [year, ...years] : years;

  const emit = (nextMonth, nextYear) => {
    if (!nextMonth || !nextYear) {
      onChange('');
      return;
    }
    onChange(`${nextMonth}/${nextYear}`);
  };

  const selectClass = compact
    ? 'px-1 py-1 border border-slate-200 rounded-md text-[11px] bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-400 min-w-[2.75rem]'
    : className;

  return (
    <div className={`flex items-center gap-0.5 ${disabled ? 'opacity-60' : ''} ${compact ? 'min-w-[5.5rem]' : ''}`}>
      <select
        value={month}
        required={required}
        disabled={disabled}
        onChange={event => emit(event.target.value, year || yearList[0])}
        className={selectClass}
        title="Expiry month"
      >
        <option value="">MM</option>
        {MONTH_NAMES.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <span className="text-slate-400 text-xs font-semibold shrink-0">/</span>
      <select
        value={year}
        required={required}
        disabled={disabled}
        onChange={event => emit(month || '01', event.target.value)}
        className={selectClass}
        title="Expiry year"
      >
        <option value="">YY</option>
        {yearList.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
