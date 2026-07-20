/**
 * Pharmacy expiry is month + year only (MM/YY), never a full calendar day.
 */

const MONTH_NAMES = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12',
];

/** Normalize any expiry-like value to MM/YY (e.g. 02/26). Returns '' if invalid. */
export function normalizeExpiry(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();

  // Already MM/YY or MM-YY
  let match = text.match(/^(0[1-9]|1[0-2])[\/\-](\d{2})$/);
  if (match) return `${match[1]}/${match[2]}`;

  // MM/YYYY
  match = text.match(/^(0[1-9]|1[0-2])[\/\-](\d{4})$/);
  if (match) return `${match[1]}/${match[2].slice(-2)}`;

  // YYYY-MM-DD or YYYY-MM
  match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (match) {
    const month = match[2];
    if (Number(month) >= 1 && Number(month) <= 12) {
      return `${month}/${match[1].slice(-2)}`;
    }
  }

  // Loose: MMYY glued, or OCR with O/l
  match = text.match(/(0[1-9]|1[0-2]|[O0][1-9]|1[O0Il12])\D?(\d{2,4})/i);
  if (match) {
    const rawMonth = match[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
    const monthNum = Math.min(12, Math.max(1, Number(rawMonth) || 1));
    const month = String(monthNum).padStart(2, '0');
    const year = match[2].slice(-2);
    return `${month}/${year}`;
  }

  return '';
}

/** Display helper — always MM/YY. */
export function formatExpiry(value) {
  return normalizeExpiry(value) || (value ? String(value) : '—');
}

/**
 * Last calendar day of the expiry month as Date (local), for comparisons.
 * Invalid → null.
 */
export function expiryEndDate(value) {
  const norm = normalizeExpiry(value);
  if (!norm) return null;
  const [mm, yy] = norm.split('/');
  const year = 2000 + Number(yy);
  const monthIndex = Number(mm) - 1;
  // Day 0 of next month = last day of this month
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
}

/** Days left until end of expiry month (negative if already past). */
export function expiryDaysLeft(value) {
  const end = expiryEndDate(value);
  if (!end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}

/** True if the batch is still sellable (expiry month not fully past). */
export function isExpiryValid(value, asOf = new Date()) {
  const end = expiryEndDate(value);
  if (!end) return true; // unknown expiry — do not block
  return end >= asOf;
}

/** ISO date string for SQL comparisons (YYYY-MM-DD = last day of month). */
export function expiryToIsoEnd(value) {
  const end = expiryEndDate(value);
  if (!end) return '';
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const d = String(end.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentYearShort() {
  return String(new Date().getFullYear()).slice(-2);
}

export function yearOptions(span = 15) {
  const start = new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= span; i += 1) {
    years.push(String(start + i).slice(-2));
  }
  return years;
}

export { MONTH_NAMES };
