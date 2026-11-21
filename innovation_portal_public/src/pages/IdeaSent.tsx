import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Check, Copy, Share2, Smartphone, Trophy, Upload } from 'lucide-react'
import clsx from 'clsx'
import Button, { buttonClasses } from '../components/ui/Button'
import Tag from '../components/ui/Tag'
import EmptyState from '../components/ui/EmptyState'
import SectionHead from '../components/home/SectionHead'
import { useI18n, StringKey } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useShellSettings } from '../components/layout/shellData'
import watermarkUrl from '../assets/brand/ceda-watermark.png'
import type { SubmitResult } from '../types/innovator'

// Screen 1.5 Idea sent (Figma 12:603 website, 12:785 phone). Built from the submit response: reference
// (copy, share to WhatsApp), where the copy was sent, the next steps with their usual timings, and three ways
// on: add detail, track, another idea. Kept in sessionStorage so a refresh keeps the page.

const KEY = 'ceda_idea_sent'

function readStored(): { result: SubmitResult; at: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function IdeaSent() {
  const { t, lang } = useI18n()
  const { isAuthenticated } = useAuth()
  const settings = useShellSettings()
  const location = useLocation()
  const fromState = (location.state as { result?: SubmitResult } | null)?.result
  const [data] = useState(() => (fromState ? { result: fromState, at: new Date().toISOString() } : readStored()))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!fromState || !data) return
    try {
      sessionStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      // Private mode: the page still shows until it is left.
    }
  }, [fromState, data])

  if (!data) {
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        <EmptyState title={t('sent.missing')} body={t('sent.missingBody')}>
          <Link to={isAuthenticated ? '/my-ideas' : '/sign-in'} className={buttonClasses({ size: 'sm' })}>
            {isAuthenticated ? t('nav.myIdeas') : t('sent.signInCta')}
          </Link>
        </EmptyState>
      </div>
    )
  }

  const { result, at } = data
  const when = new Date(at).toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const channel = result.copy_sent_to?.channel
  const steps = [{ name: t('sent.received'), usual_duration: t('sent.receivedWhen', { when }), explanation: '' }, ...result.next_steps]
  const hasAccount = isAuthenticated || Boolean(result.account?.created) || result.is_guest === false
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(t('sent.shareText', { ref: result.reference }))}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      /* the reference is on screen to copy by hand */
    }
  }

  return (
    <>
      <section aria-labelledby="sent-title" className="relative overflow-hidden bg-banner text-on-banner">
        <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none select-none absolute right-[-260px] top-[-80px] w-[900px] max-w-none hidden lg:block" />
        <div className="relative max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-16 flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <span aria-hidden className="w-14 h-14 rounded-full bg-yellow text-banner-deep flex items-center justify-center">
              <Check size={30} strokeWidth={2.5} />
            </span>
            <h1 id="sent-title" className="font-heading font-extrabold text-d-mh1 lg:text-d-h1">
              {t('sent.title')}{' '}
              <span className="text-amber">{result.first_name ? t('sent.wellDone', { name: result.first_name }) : t('sent.wellDoneNoName')}</span>
            </h1>
            {result.copy_sent_to && (
              <p className="text-d-body text-banner-muted">
                {t('sent.copyTo', { to: result.copy_sent_to.to, channel: t(`sent.channel.${channel}` as StringKey) || String(channel) })}
              </p>
            )}
          </div>
          <div className="bg-surface text-text rounded-[16px] p-6 flex flex-col gap-2.5 w-full lg:w-[400px] shrink-0">
            <p className="text-d-over uppercase font-heading text-muted">{t('sent.reference')}</p>
            <p className="text-d-h3 font-heading break-all">{result.reference}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copy} icon={copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}>
                {copied ? t('sent.copied') : t('sent.copy')}
              </Button>
              <a href={shareUrl} target="_blank" rel="noreferrer" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                <Share2 size={16} aria-hidden />
                {t('sent.share')}
              </a>
            </div>
            <span role="status" className="sr-only">{copied ? t('sent.copied') : ''}</span>
            <p className="text-d-cap text-muted">{[result.title, result.sector?.name].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="next-title">
        <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-[72px] flex flex-col gap-7">
          <SectionHead id="next-title" overline={t('sent.nextOver')} title={t('sent.nextTitle', { n: steps.length })} />
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr gap-5">
            {steps.map((s, i) => (
              <li key={i} className="flex lg:flex-col gap-3">
                <span
                  aria-hidden
                  className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-d-label-s shrink-0',
                    i === 0 ? 'bg-success text-on-primary' : i === 1 ? 'bg-accent text-on-accent' : 'bg-surface2 text-muted',
                  )}
                >
                  {i === 0 ? <Check size={16} strokeWidth={3} /> : i + 1}
                </span>
                <span className="flex flex-col gap-0.5 items-start">
                  <span className="text-d-h5 font-heading text-text">{s.name}</span>
                  {s.usual_duration && <span className="text-d-cap text-muted">{s.usual_duration}</span>}
                  {s.explanation && <span className="text-d-cap text-muted">{s.explanation}</span>}
                  {i === 1 && <Tag tone="orange" className="mt-1">{t('sent.next')}</Tag>}
                </span>
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Upload, title: t('sent.addTitle'), body: t('sent.addBody'),
                cta: hasAccount ? { to: `/my-ideas/${result.submission_id}`, label: t('sent.addCta'), primary: true } : { to: '/sign-in', label: t('sent.signInCta'), primary: true },
              },
              {
                icon: Smartphone, title: t('sent.trackTitle'),
                body: settings.ussd_code ? t('sent.trackBody', { ussd: settings.ussd_code }) : t('sent.trackBodyNoUssd'),
                cta: hasAccount ? { to: `/my-ideas/${result.submission_id}`, label: t('sent.trackCta') } : { to: '/sign-in', label: t('sent.signInCta') },
                also: hasAccount ? { to: '/my-ideas', label: t('nav.myIdeas') } : undefined,
              },
              { icon: Trophy, title: t('sent.moreTitle'), body: t('sent.moreBody'), cta: { to: '/challenges', label: t('sent.moreCta') } },
            ].map(({ icon: Icon, title, body, cta, also }: { icon: typeof Upload; title: string; body: string; cta: { to: string; label: string; primary?: boolean }; also?: { to: string; label: string } }) => (
              <div key={title} className="flex flex-col gap-3 items-start p-6 rounded-card border border-border">
                <span aria-hidden className="w-11 h-11 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center">
                  <Icon size={22} />
                </span>
                <h2 className="text-d-h4 font-heading text-text">{title}</h2>
                <p className="text-d-body-s text-muted">{body}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link to={cta.to} className={buttonClasses({ variant: cta.primary ? 'primary' : 'secondary', size: 'sm' })}>
                    {cta.label}
                    {cta.primary && <ArrowRight size={16} aria-hidden />}
                  </Link>
                  {also && (
                    <Link to={also.to} className="text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {also.label}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
