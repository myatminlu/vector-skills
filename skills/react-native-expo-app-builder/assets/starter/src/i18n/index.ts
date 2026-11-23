import { en, type MessageKey } from './en';
import { my } from './my';

export type Language = 'en' | 'my';
export type { MessageKey };
export type TranslateParams = Record<string, string | number>;

export const LANGUAGES: readonly Language[] = ['en', 'my'];

/** How each language names itself in the picker. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', my: 'မြန်မာ' };

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, my };

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'my';
}

/** Device locales and APIs disagree on Burmese (`my`, `my-MM`, the older `mm`); everything maps to the app's codes. */
export function normalizeLanguage(value: string | null | undefined): Language | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'my' || lower === 'mm' || lower.startsWith('my-') || lower.startsWith('my_')) return 'my';
  if (lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_')) return 'en';
  return null;
}

export function translate(lang: Language, key: MessageKey, params?: TranslateParams): string {
  const template = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

let currentLanguage: Language = 'en';
const listeners = new Set<(lang: Language) => void>();

/** Module-level accessor for non-React code (error messages, notifications, the error boundary). */
export const i18n = {
  get language(): Language {
    return currentLanguage;
  },
  setLanguage(lang: Language) {
    if (lang === currentLanguage) return;
    currentLanguage = lang;
    listeners.forEach((listener) => listener(lang));
  },
  subscribe(listener: (lang: Language) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  t(key: MessageKey, params?: TranslateParams): string {
    return translate(currentLanguage, key, params);
  },
};
