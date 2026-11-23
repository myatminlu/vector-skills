import { getLocales } from 'expo-localization';
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useState } from 'react';

import { localStore, StoreKeys } from '@/lib/local-store';

import { formatCount, formatDate } from './format';
import { i18n, isLanguage, type Language, type MessageKey, normalizeLanguage, translate, type TranslateParams } from './index';

type I18nContextValue = {
  lang: Language;
  t: (key: MessageKey, params?: TranslateParams) => string;
  setLanguage: (lang: Language) => void;
  fmt: {
    count: (value: number) => string;
    date: (value: string | Date | null | undefined) => string;
  };
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * The UI language belongs to the phone: a stored choice, else the device language when the app has it, else English.
 * The language that content or AI answers come back in is a separate, per-account setting — keep the two apart.
 */
function detectInitialLanguage(): Language {
  const stored = localStore.getSync(StoreKeys.language);
  if (isLanguage(stored)) return stored;
  for (const locale of getLocales()) {
    const lang = normalizeLanguage(locale.languageTag) ?? normalizeLanguage(locale.languageCode);
    if (lang) return lang;
  }
  return 'en';
}

const initialLanguage = detectInitialLanguage();
i18n.setLanguage(initialLanguage);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [lang, setLang] = useState<Language>(initialLanguage);

  useEffect(() => i18n.subscribe(setLang), []);

  const setLanguage = useCallback((next: Language) => {
    localStore.setSync(StoreKeys.language, next);
    i18n.setLanguage(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      t: (key, params) => translate(lang, key, params),
      setLanguage,
      fmt: {
        count: (n) => formatCount(n, lang),
        date: (v) => formatDate(v, lang),
      },
    }),
    [lang, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = use(I18nContext);
  if (!value) throw new Error('useI18n must be used inside LanguageProvider');
  return value;
}
