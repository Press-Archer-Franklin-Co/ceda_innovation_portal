import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, FileText, Lightbulb, Megaphone, Search, Trophy } from 'lucide-react'
import clsx from 'clsx'
import Tag from '../ui/Tag'
import Skeleton from '../ui/Skeleton'
import { hasString, useI18n } from '../../i18n'
import { GROUP_ORDER, MIN_QUERY, searchSite, toRows, type RowIcon, type SearchResult, type SearchRow } from '../../lib/siteSearch'

// Screen 1.3 search (Figma 11:497 website panel, 11:694 phone menu). Results update as you type (250 ms after
// the last key), grouped as challenges, stories, news and help. Up and down move, Enter opens. Esc is left to
// the surface around it (the panel or the phone menu), which closes. A combobox with a grouped listbox.

const ICONS: Record<RowIcon, typeof Trophy> = { challenge: Trophy, story: Lightbulb, post: Megaphone, help: FileText }
const DEBOUNCE_MS = 250

/** The title with each match of the search words in red (Figma 11:497). Plain text pieces, no HTML. */
function Highlight({ text, term }: { text: string; term: string }) {
  const words = term.split(/\s+/).filter((w) => w.length >= 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'))
  return <>{parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="bg-transparent text-primary">{part}</mark> : part))}</>
}

type Status = 'idle' | 'loading' | 'ok' | 'error'

export default function SiteSearch({ variant, onNavigate, onQueryChange }: { variant: 'panel' | 'drawer'; onNavigate: () => void; onQueryChange?: (hasQuery: boolean) => void }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const baseId = useId()
  const listId = `${baseId}-list`
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [active, setActive] = useState(-1)
  const [attempt, setAttempt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const term = q.trim()
  const hasQuery = term.length > 0
  useEffect(() => onQueryChange?.(hasQuery), [hasQuery, onQueryChange])

  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setStatus('idle')
      setResult(null)
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    const timer = window.setTimeout(() => {
      searchSite(term, lang, controller.signal)
        .then((r) => {
          setResult(r)
          setStatus('ok')
          setActive(-1)
        })
        .catch((err) => {
          if (controller.signal.aborted || (err as { name?: string })?.name === 'CanceledError') return
          setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [term, lang, attempt])

  const rows = useMemo(() => (result ? toRows(result, t as never, lang, hasString) : []), [result, t, lang])

  const open = (row: SearchRow) => {
    onNavigate()
    if (row.external) window.open(row.href, '_blank', 'noopener,noreferrer')
    else navigate(row.href)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!rows.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? rows.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      open(rows[active])
    }
  }

  // Keep the highlighted row in view while moving with the keys.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, baseId])

  const showList = status === 'ok' && rows.length > 0
  const panel = variant === 'panel'
  const total = result?.total ?? 0

  return (
    <div className="flex flex-col min-h-0">
      <div className={clsx('flex items-center gap-3 shrink-0', panel ? 'h-[63px] px-[22px] border-b border-border' : 'h-[46px] px-3.5 rounded-control border border-transparent bg-surface2 focus-within:border-primary')}>
        <Search size={panel ? 22 : 18} aria-hidden className={clsx('shrink-0', panel ? 'text-primary' : 'text-muted')} />
        <input
          ref={inputRef}
          data-autofocus
          type="search"
          role="combobox"
          aria-label={t('search.label')}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${baseId}-opt-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={t('search.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx('flex-1 min-w-0 bg-transparent text-text placeholder:text-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden', panel ? 'text-d-h4 font-heading' : 'text-d-body-s')}
        />
        {panel && (
          <>
            <span aria-hidden className="w-px h-6 bg-border" />
            <Tag className="shrink-0">{t('search.esc')}</Tag>
          </>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {status === 'loading' ? t('search.loading') : status === 'ok' ? (total === 1 ? t('search.countOne', { q: term }) : total ? t('search.count', { n: total, q: term }) : t('search.none', { q: term })) : ''}
      </p>

      <div className={clsx('overflow-y-auto overscroll-contain', panel ? 'max-h-[min(478px,calc(100vh-260px))]' : 'mt-2')}>
        {status === 'idle' && term.length > 0 && <p className={clsx('text-d-cap text-muted', panel ? 'px-[22px] py-4' : 'px-1 py-3')}>{t('search.hint')}</p>}

        {status === 'loading' && !result && (
          <div aria-hidden className={clsx('space-y-3', panel ? 'px-[22px] py-[18px]' : 'py-2')}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 h-[58px] px-3">
                <Skeleton className="w-9 h-9 rounded-[10px]" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-1/4" /></div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className={clsx('flex items-center justify-between gap-3 text-d-body-s', panel ? 'px-[22px] py-5' : 'px-1 py-4')}>
            <span className="text-danger">{t('search.error')}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t('common.retry')}
            </button>
          </div>
        )}

        {status === 'ok' && rows.length === 0 && (
          <div className={clsx('text-d-body-s', panel ? 'px-[22px] py-6' : 'px-1 py-5')}>
            <p className="text-d-h5 font-heading text-text">{t('search.none', { q: term })}</p>
            <p className="mt-1 text-muted">{t('search.noneBody')}</p>
            <Link to="/faq" onClick={onNavigate} className="mt-3 inline-flex items-center gap-1.5 text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t('search.askHelp')} <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        )}

        {(showList || (status === 'loading' && rows.length > 0)) && (
          <div id={listId} role="listbox" aria-label={t('search.label')} className={clsx(panel ? 'px-[22px] pt-[18px] pb-2 space-y-[18px]' : 'py-1 space-y-4', status === 'loading' && 'opacity-60')}>
            {GROUP_ORDER.map((group) => {
              const items = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.group === group)
              if (!items.length) return null
              const labelId = `${baseId}-g-${group}`
              return (
                <div key={group} role="group" aria-labelledby={labelId}>
                  <p id={labelId} className="text-d-label-s font-bold uppercase tracking-[0.08em] text-text mb-1.5">{t(`search.group.${group}` as never)}</p>
                  {items.map(({ row, index }) => {
                    const Icon = ICONS[row.icon]
                    const on = index === active
                    return (
                      <div
                        key={row.id}
                        id={`${baseId}-opt-${index}`}
                        role="option"
                        aria-selected={on}
                        onMouseEnter={() => setActive(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => open(row)}
                        className={clsx('flex items-center gap-3 min-h-[58px] px-3 rounded-[10px] cursor-pointer', on ? 'bg-surface2' : 'hover:bg-surface2/60')}
                      >
                        <span aria-hidden className="w-9 h-9 shrink-0 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center">
                          <Icon size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] leading-5 text-text truncate"><Highlight text={row.title} term={term} /></span>
                          {row.meta && <span className="block text-d-cap text-muted truncate">{row.meta}</span>}
                        </span>
                        {row.external && <span className="sr-only">{t('search.opensNew')}</span>}
                        {/* Figma: only the highlighted row shows where Enter goes. */}
                        {on && (row.external ? <ExternalLink size={16} aria-hidden className="text-primary shrink-0" /> : <ArrowRight size={18} aria-hidden className="text-primary shrink-0" />)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {panel && (
        <div className="flex items-center justify-between gap-4 h-11 px-[22px] border-t border-border bg-surface2 shrink-0 text-d-cap text-muted">
          <span aria-hidden>{t('search.keys')}</span>
          {status === 'ok' && total > 0 && <span className="text-d-label-s text-text">{total === 1 ? t('search.countOne', { q: term }) : t('search.count', { n: total, q: term })}</span>}
        </div>
      )}
    </div>
  )
}
