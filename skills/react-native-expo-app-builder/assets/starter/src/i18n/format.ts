import type { Language } from './index';

const BURMESE_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

export function toBurmeseDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => BURMESE_DIGITS[Number(digit)] ?? digit);
}

/** Counts use Burmese digits in Burmese. Prices and codes usually should not — decide per design. */
export function formatCount(value: number, lang: Language): string {
  const text = new Intl.NumberFormat('en-US').format(value);
  return lang === 'my' ? toBurmeseDigits(text) : text;
}

export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, lang: Language): string {
  const date = parseDate(value);
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'my' ? 'my-MM' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * The calendar day (`YYYY-MM-DD`) of `date` in an IANA time zone. Never `toISOString().slice(0, 10)`: that is UTC,
 * and in Asia/Yangon it is still "yesterday" until 06:30 in the morning.
 */
export function localDateKey(date: Date = new Date(), timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const [year, month, day] = [get('year'), get('month'), get('day')];
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through to local components
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
