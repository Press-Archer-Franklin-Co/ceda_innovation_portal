import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en, { StringKey } from './en'
import tn from './tn'

export type Lang = 'en' | 'tn'
export const LANGS: Lang[] = ['en', 'tn']
const STRINGS: Record<Lang, Record<StringKey, string>> = { en, tn }
const STORAGE_KEY = 'ceda_lang'

/** Current language outside React (used by the API client to send ?lang=). */
let currentLang: Lang = readStoredLang()
export function getLang(): Lang {
  return currentLang
}

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'tn' ? 'tn' : 'en'
  } catch {
    return 'en'
  }
}

type Vars = Record<string, string | number>
export type TFunction = (key: StringKey, vars?: Vars) => string

function format(template: string, vars?: Vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFunction
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang)

  const setLang = useCallback((next: Lang) => {
    currentLang = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode: keep it for this visit only */
    }
    setLangState(next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback<TFunction>((key, vars) => format(STRINGS[lang][key] ?? en[key] ?? key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

const fallback: I18nValue = {
  lang: 'en',
  setLang: () => undefined,
  t: (key, vars) => format(en[key] ?? key, vars),
}

/** UI strings. Works without a provider (falls back to English) so components stay usable in tests. */
export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? fallback
}

export function useT(): TFunction {
  return useI18n().t
}

export type { StringKey }
