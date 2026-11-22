import { Fragment, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import PageBanner from '../layout/PageBanner'
import Button from '../ui/Button'
import Skeleton, { SkeletonText } from '../ui/Skeleton'
import { ErrorState } from '../ui/EmptyState'
import { SelectControl } from '../ui/Select'
import { useI18n } from '../../i18n'
import { formatDate } from '../../lib/dates'
import { useAsync } from '../../lib/useAsync'
import { usePageTitle } from '../../lib/usePageTitle'
import { policiesService, PolicyKey } from '../../services/policies.service'

// Figma 1.13 About and policies (138:2202 website, 138:2527 phone): one reading template for About,
// Guidelines, Terms of use, Terms of agreement and Privacy. The text comes from the Terms manager (3.35)
// through the API, in the current language. ① "On this page" on the left (a drop-down on phones) moves
// between the documents. ② One readable column with numbered headings, the last updated date and version
// in the banner, and Download as PDF (the browser's print dialog, which saves a PDF).

export const POLICY_PATHS: Record<PolicyKey, string> = {
  about: '/about',
  guidelines: '/guidelines',
  terms_of_use: '/terms-of-use',
  terms_of_agreement: '/terms-of-agreement',
  privacy: '/privacy-policy',
}
const ORDER: PolicyKey[] = ['about', 'guidelines', 'terms_of_use', 'terms_of_agreement', 'privacy']
const BULLET = '• '

/** Plain text to blocks: a blank line starts a paragraph, lines starting with "• " become a list. */
export function textBlocks(body: string): ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] {
  const blocks: ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] = []
  for (const chunk of body.split(/\n\s*\n/)) {
    let lines: string[] = []
    let items: string[] = []
    const flush = () => {
      if (lines.length) blocks.push({ kind: 'p', text: lines.join('\n') })
      if (items.length) blocks.push({ kind: 'ul', items })
      lines = []
      items = []
    }
    for (const raw of chunk.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      if (line.startsWith(BULLET) || line.startsWith('•')) {
        if (lines.length) {
          blocks.push({ kind: 'p', text: lines.join('\n') })
          lines = []
        }
        items.push(line.replace(/^•\s*/, ''))
      } else {
        if (items.length) {
          blocks.push({ kind: 'ul', items })
          items = []
        }
        lines.push(line)
      }
    }
    flush()
  }
  return blocks
}

function Body({ text }: { text: string }) {
  return (
    <>
      {textBlocks(text).map((block, i) =>
        block.kind === 'p' ? (
          <p key={i} className="text-d-body text-text whitespace-pre-line">{block.text}</p>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5 pl-5 list-disc marker:text-primary text-d-body text-text">
            {block.items.map((item, j) => <li key={j}>{item}</li>)}
          </ul>
        ),
      )}
    </>
  )
}

function Contents({ current }: { current: PolicyKey }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <>
      {/* Website: the list on the left. */}
      <nav aria-labelledby="doc-contents" className="hidden lg:flex flex-col gap-1 w-[260px] shrink-0 print:hidden">
        <p id="doc-contents" className="text-d-label-s text-muted">{t('doc.contents')}</p>
        {ORDER.map((key) => (
          <NavLink
            key={key}
            to={POLICY_PATHS[key]}
            className={clsx(
              'rounded-control px-3 py-2 text-d-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              key === current ? 'bg-primary-soft text-primary' : 'text-text hover:bg-surface2',
            )}
            aria-current={key === current ? 'page' : undefined}
          >
            {t(`doc.nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      {/* Phone: a drop-down. */}
      <div className="lg:hidden flex flex-col gap-1 print:hidden">
        <p id="doc-contents-phone" className="text-d-label-s text-muted">{t('doc.contents')}</p>
        <SelectControl
          aria-label={t('doc.contents')}
          value={current}
          onChange={(key) => navigate(POLICY_PATHS[key])}
          options={ORDER.map((key) => ({ value: key, label: t(`doc.nav.${key}`) }))}
          searchable={false}
        />
      </div>
    </>
  )
}

function ArticleSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Fragment key={i}>
          <Skeleton className="h-6 w-64" />
          <SkeletonText lines={3} />
        </Fragment>
      ))}
    </div>
  )
}

export default function PolicyDocument({ policy, children }: { policy: PolicyKey; children?: ReactNode }) {
  const { t, lang } = useI18n()
  const res = useAsync(() => policiesService.get(policy, lang), [policy, lang])
  const doc = res.data && res.data.key === policy ? res.data : undefined
  const title = doc?.title || t(`doc.nav.${policy}`)
  usePageTitle(title)
  const id = `doc-${policy}-title`
  let number = 0

  return (
    <div id="policy-print">
      {/* Download as PDF prints only the document. */}
      <style>{'@media print { body * { visibility: hidden } #policy-print, #policy-print * { visibility: visible } #policy-print { position: absolute; inset: 0 } }'}</style>
      <PageBanner
        id={id}
        overline={t('doc.over')}
        title={title}
        subtitle={doc?.updated_at ? t('doc.updated', { date: formatDate(doc.updated_at, lang), version: doc.version }) : undefined}
      />
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          <Contents current={policy} />
          <article aria-labelledby={id} className="w-full lg:max-w-[680px] flex flex-col gap-[14px]">
            {res.error && !doc ? (
              <ErrorState title={t('doc.loadError')} onRetry={res.reload} retrying={res.fetching} />
            ) : !doc ? (
              <ArticleSkeleton />
            ) : (
              <>
                {doc.english_fallback && (
                  <p role="note" className="rounded-control bg-surface2 text-text px-4 py-3 text-d-body-s">{t('doc.englishFallback')}</p>
                )}
                {doc.intro && <p className="text-d-body text-muted">{doc.intro}</p>}
                {doc.sections.map((section, i) => {
                  if (section.heading) number += 1
                  return (
                    <Fragment key={i}>
                      {section.heading && <h2 className="font-heading text-d-h4 text-text">{`${number}. ${section.heading}`}</h2>}
                      <Body text={section.body} />
                    </Fragment>
                  )
                })}
                {children}
                <div className="print:hidden">
                  <Button variant="secondary" onClick={() => window.print()}>
                    {t('doc.download')}
                  </Button>
                </div>
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
