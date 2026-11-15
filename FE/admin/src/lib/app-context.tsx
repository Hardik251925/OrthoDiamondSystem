import { createContext, useContext } from 'react';
import { strings, type Lang, type StringKey } from '../i18n';

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => undefined });

export function useT() {
  const { lang } = useContext(LangContext);
  return (k: StringKey) => strings[lang][k] ?? strings.en[k];
}
