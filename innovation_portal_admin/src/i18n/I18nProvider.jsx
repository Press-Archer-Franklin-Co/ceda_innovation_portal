import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLang, I18nContext, storeLang, translate } from './context'

export default function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getLang)

  const setLang = useCallback((next) => {
    storeLang(next)
    setLangState(next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
