import { createContext, useContext } from 'react';
import { en } from './en';
import { he } from './he';

export type Lang = 'en' | 'he';

const translations: Record<Lang, Record<string, string>> = { en, he };

/** Translate a key, with optional placeholder replacement */
export function t(lang: Lang, key: string, params?: Record<string, string>): string {
  let text = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

/** React context for current language */
export const LangContext = createContext<Lang>('en');

/** Hook to get `t()` bound to current language */
export function useTranslation() {
  const lang = useContext(LangContext);
  return {
    lang,
    t: (key: string, params?: Record<string, string>) => t(lang, key, params),
  };
}
