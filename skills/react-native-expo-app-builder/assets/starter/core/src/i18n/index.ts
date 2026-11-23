import { extraLanguages, moduleStrings } from '@/modules/strings';

import { coreStrings } from './strings';

/** Every key the app can show: the core's plus those of the installed modules (`src/modules/strings.ts`). */
export type MessageKey = keyof typeof coreStrings | keyof typeof moduleStrings;
export type Language = string;
export type TranslateParams = Record<string, string | number>;

const en: Record<string, string> = { ...coreStrings, ...moduleStrings };

/** English plus whatever languages modules add. The language picker shows only when there is more than one. */
export const LANGUAGES: readonly Language[] = ['en', ...extraLanguages.map((language) => language.code)];

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ...Object.fromEntries(extraLanguages.map((language) => [language.code, language.name])) };

const dictionaries: Record<Language, Record<string, string>> = { en, ...Object.fromEntries(extraLanguages.map((language) => [language.code, language.strings])) };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGES.includes(value);
}

/** Device locales and APIs spell languages many ways (`en_US`, `my-MM`, `mm`); everything maps to the app's codes. */
export function normalizeLanguage(value: string | null | undefined): Language | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  const extra = extraLanguages.find((language) => language.matches(lower));
  if (extra) return extra.code;
  if (lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_')) return 'en';
  return null;
}

/** The locale dates are formatted in. */
export function localeOf(lang: Language): string {
  return extraLanguages.find((language) => language.code === lang)?.locale ?? 'en-GB';
}

export function translate(lang: Language, key: MessageKey, params?: TranslateParams): string {
  const template = dictionaries[lang]?.[key] ?? en[key] ?? key;
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
