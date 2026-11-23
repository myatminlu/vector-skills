import { extraLanguages } from '@/modules/strings';

import { type Language, localeOf } from './index';

/** Counts in the language's own digits when a language module says so (Burmese does); plain digits otherwise. */
export function formatCount(value: number, lang: Language): string {
  const custom = extraLanguages.find((language) => language.code === lang)?.formatCount;
  return custom ? custom(value) : new Intl.NumberFormat('en-US').format(value);
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
    return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * The calendar day (`YYYY-MM-DD`) of `date` in an IANA time zone. Never `toISOString().slice(0, 10)`: that is UTC,
 * and east of Greenwich it is still "yesterday" for the first hours of every morning.
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
