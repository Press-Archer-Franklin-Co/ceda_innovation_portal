import { createContext, useContext } from 'react'
import en from './en'
import tn from './tn'

export const LANGS = ['en', 'tn']
export const STRINGS = { en, tn }
const STORAGE_KEY = 'ceda_lang'

function readStoredLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'tn' ? 'tn' : 'en'
  } catch {
    return 'en'
  }
}

let currentLang = readStoredLang()

/** Current language outside React (the API client sends it as Accept-Language). */
export function getLang() {
  return currentLang
}

export function storeLang(next) {
  currentLang = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* private mode: keep it for this visit only */
  }
}

export function format(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}

export function translate(lang, key, vars) {
  return format(STRINGS[lang]?.[key] ?? en[key] ?? key, vars)
}

export const I18nContext = createContext(null)

const fallback = {
  lang: 'en',
  setLang: () => undefined,
  t: (key, vars) => translate('en', key, vars),
}

/** UI strings: const { t, lang, setLang } = useI18n(). Works without a provider (English). */
export function useI18n() {
  return useContext(I18nContext) ?? fallback
}

export function useT() {
  return useI18n().t
}

/** Keys present in en but missing in tn (shown on the styleguide). */
export function missingTranslations() {
  return Object.keys(en).filter((k) => !(k in tn))
}
