import { useState } from 'react'
import { Inbox, Plus } from 'lucide-react'
import Button from '../components/ui/Button'
import Tag, { NewCue } from '../components/ui/Tag'
import Input from '../components/ui/Input'
import Textarea from '../components/ui/Textarea'
import Select from '../components/ui/Select'
import { Checkbox, Radio, RadioGroup, Toggle } from '../components/ui/Choice'
import Card from '../components/ui/Card'
import Tabs from '../components/ui/Tabs'
import Modal from '../components/ui/Modal'
import { ToastCard } from '../components/ui/ToastProvider'
import { useToast } from '../components/ui/toast'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import ForbiddenState from '../components/ui/ForbiddenState'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { SkeletonTable } from '../components/ui/LoadingSkeleton'
import Pagination from '../components/ui/Pagination'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import StepProgress from '../components/ui/StepProgress'
import Logo, { CedaMark } from '../components/ui/Logo'
import PageHeader from '../components/ui/PageHeader'
import SectionCard from '../components/ui/SectionCard'
import Sidebar from '../layout/Sidebar'
import { LayoutContext } from '../layout/LayoutContext'
import { missingTranslations, useI18n } from '../i18n/context'

// Dev-only page (/staff/styleguide, no sign-in). Every shared component and state, labelled with its
// Figma frame on Foundations (https://www.figma.com/design/dzLeXDnM9ldZEurtYDcIh2). Sample text is for display only.

function Section({ figma, title, children }) {
  return (
    <section className="py-6 border-b border-border">
      <p className="text-d-over uppercase text-accent">{figma}</p>
      <h2 className="text-[18px] font-heading font-bold text-text mt-0.5 mb-4">{title}</h2>
      {children}
    </section>
  )
}

const swatches = [
  'bg', 'surface', 'surface2', 'border', 'text', 'muted', 'banner', 'banner-deep', 'banner-muted', 'primary', 'primary-soft',
  'accent', 'accent-soft', 'amber', 'yellow', 'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft',
  'info', 'info-soft', 'cms', 'cms-soft', 'scrim',
]
const tones = ['neutral', 'red', 'orange', 'green', 'amber', 'blue', 'new', 'dark', 'cms', 'selected', 'unknown']
const judges = ['Kabo Molefe', 'Lesego Dintwe', 'Mpho Seretse', 'Neo Mosweu', 'Onalenna Kgosi', 'Tebogo Ramotswa', 'Thato Phiri', 'Wame Sebego', 'Boitumelo Tau'].map((n) => ({ value: n, label: n }))
const previewAdmin = { first_name: 'Preview', last_name: 'Admin', roles: ['administrator'] }

export default function Styleguide() {
  const { lang, setLang } = useI18n()
  const toast = useToast()
  const [dark, setDark] = useState(false)
  const [tab, setTab] = useState('entries')
  const [judge, setJudge] = useState(null)
  const [yes, setYes] = useState('yes')
  const [toggle, setToggle] = useState(true)
  const [page, setPage] = useState(3)
  const [step, setStep] = useState(1)
  const [modal, setModal] = useState('none')
  const [note, setNote] = useState('Strong local demand; needs a costed plan.')
  const missing = missingTranslations()

  const switchTheme = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-[1200px] mx-auto px-4 2xl:px-6 py-6">
        <PageHeader
          title="Styleguide (staff console)"
          subtitle="Dev only. Labels match Figma › Foundations. Staff density: compact by default, roomier from 2xl."
          actions={
            <>
              <LanguageSwitch />
              <Button variant="secondary" size="sm" onClick={() => setLang(lang === 'en' ? 'tn' : 'en')}>Lang: {lang}</Button>
              <Toggle label="Dark (draft)" checked={dark} onChange={switchTheme} />
            </>
          }
        />
        <p className="text-d-cap text-muted">Setswana keys missing: {missing.length === 0 ? 'none' : missing.join(', ')}</p>

        <Section figma="Shell" title="Sidebar (as an administrator) and top bar">
          <div className="relative h-[720px] rounded-card border border-border overflow-hidden" style={{ transform: 'translateZ(0)' }}>
            <LayoutContext.Provider value={{ sidebarOpen: true, mobileSidebarOpen: false, setSidebarOpen: () => {}, setMobileSidebarOpen: () => {} }}>
              <Sidebar previewUser={previewAdmin} />
            </LayoutContext.Provider>
            <div className="absolute inset-y-0 right-0 left-[var(--sidebar-width)] bg-bg p-4">
              <PageHeader title="Review queue" subtitle="Ideas waiting for a first look." actions={<Button size="sm" icon={<Plus size={14} aria-hidden />}>Add challenge</Button>} />
              <SectionCard title="Entries" subtitle="Skeleton rows keep the columns while loading" padding={false}>
                <SkeletonTable rows={5} cols={5} />
              </SectionCard>
            </div>
          </div>
        </Section>

        <Section figma="Foundations board › Colours" title="Colour tokens">
          <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-9 gap-2.5">
            {swatches.map((s) => (
              <div key={s}>
                <div className="h-10 rounded-control border border-border" style={{ background: `rgb(var(--c-${s}))` }} />
                <p className="text-d-cap text-muted mt-1">{s}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section figma="Components › Brand" title="CEDA mark and Logo">
          <div className="flex flex-wrap items-center gap-6">
            <CedaMark height={64} label="CEDA" />
            <Logo />
            <Logo theme="dark" subtitle="Staff console" />
          </div>
        </Section>

        <Section figma="Components › Buttons" title="Button (staff sizes)">
          {['lg', 'md', 'sm'].map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2.5 mb-2.5">
              <Button size={size} arrow>Primary</Button>
              <Button size={size} variant="accent">Accent</Button>
              <Button size={size} variant="secondary">Secondary</Button>
              <Button size={size} variant="soft">Soft</Button>
              <Button size={size} variant="ghost">Ghost</Button>
              <span className="bg-banner p-1.5 rounded-control inline-flex"><Button size={size} variant="onDark">On dark</Button></span>
              <Button size={size} variant="danger">Danger</Button>
              <Button size={size} variant="link">Link</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button disabled>Disabled</Button>
            <Button loading>Saving</Button>
            <button className="btn-primary">.btn-primary (older pages)</button>
            <button className="btn-secondary">.btn-secondary</button>
            <button className="btn-ghost">.btn-ghost</button>
          </div>
        </Section>

        <Section figma="Components › Tags · Status chips" title="Tag">
          <div className="flex flex-wrap gap-2 mb-3">
            {tones.map((tone) => (
              <Tag key={tone} tone={tone}>{tone === 'unknown' ? undefined : tone}</Tag>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="neutral" dot>Draft</Tag>
            <Tag tone="blue" dot>Submitted</Tag>
            <Tag tone="blue" dot>In review</Tag>
            <Tag tone="amber" dot>Needs your input</Tag>
            <Tag tone="green" dot>Approved</Tag>
            <Tag tone="green" dot dotClassName="bg-yellow">Winner</Tag>
            <Tag tone="red" dot>Not taken forward</Tag>
            <Tag tone="unknown" dot />
            <NewCue />
            <NewCue dotOnly />
          </div>
        </Section>

        <Section figma="Components › Inputs" title="Fields">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Input label="Label" placeholder="Placeholder" hint="Hint" />
            <Input label="Label" defaultValue="Filled" hint="Hint" />
            <Input label="Label" placeholder="Placeholder" error="Give the challenge a name" />
            <Input label="Label" placeholder="Disabled" disabled />
            <Textarea label="Note to the applicant" maxChars={50} value={note} onChange={(e) => setNote(e.target.value)} />
            <Select label="Judge" options={judges} value={judge} onChange={setJudge} hint="Type to search" required />
            <RadioGroup name="sg-yes" legend="Visible on the home page?" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} value={yes} onChange={setYes} inline />
            <div>
              <Checkbox label="Notify the applicant" description="They get an SMS and an email." defaultChecked />
              <Checkbox label="Error state" invalid />
              <Radio name="sg-r" label="Radio on its own" />
              <Toggle label="Feature on home page" checked={toggle} onChange={setToggle} />
            </div>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <label className="block"><span className="label">.input (older pages)</span><input className="input" placeholder="Placeholder" /></label>
          </div>
        </Section>

        <Section figma="Components › Tabs" title="Tabs">
          <Tabs
            label="Challenge sections"
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'entries', label: 'Entries', count: 48 },
              { key: 'form', label: 'Form' },
              { key: 'criteria', label: 'Marking criteria', count: 5 },
              { key: 'judges', label: 'Judges', count: 6 },
              { key: 'results', label: 'Results' },
            ]}
            active={tab}
            onChange={setTab}
          />
          <Tabs className="mt-3" variant="segment" tabs={[{ key: 'overview', label: 'Overview' }, { key: 'entries', label: 'Entries', count: 12 }]} active={tab === 'entries' ? 'entries' : 'overview'} onChange={setTab} />
        </Section>

        <Section figma="Segmented progress (3.4b, 3.5)" title="StepProgress">
          <StepProgress steps={['Basics', 'Who can enter', 'Form', 'Judging', 'Publish']} current={step} saved onStepClick={setStep} />
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
            <Button size="sm" onClick={() => setStep((s) => Math.min(4, s + 1))}>Next</Button>
          </div>
        </Section>

        <Section figma="Components › Card" title="Card and SectionCard">
          <div className="grid sm:grid-cols-3 gap-3.5">
            <Card><p className="font-heading font-bold">Plain</p><p className="text-[13px] text-muted">White, 1px border, radius 12.</p></Card>
            <Card tone="soft"><p className="font-heading font-bold">Soft</p><p className="text-[13px] text-muted">Cream panel.</p></Card>
            <SectionCard title="Section card" subtitle="With a title row">Body</SectionCard>
          </div>
        </Section>

        <Section figma="Components › Modal and confirm dialog" title="Modal">
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={() => setModal('form')}>Add partner</Button>
            <Button variant="danger" onClick={() => setModal('confirm')}>Delete partner</Button>
          </div>
          <Modal
            open={modal === 'form'}
            onClose={() => setModal('none')}
            title="Add partner"
            description="Partners show in the strip on the home page. You can hide them at any time."
            closeOnBackdrop={false}
            footer={<><Button variant="ghost" onClick={() => setModal('none')}>Cancel</Button><Button onClick={() => setModal('none')}>Save partner</Button></>}
          >
            <div className="space-y-3.5">
              <Input label="Organisation name" hint="As it should appear on the site" />
              <Input label="Website" placeholder="https://" optional />
            </div>
          </Modal>
          <Modal
            open={modal === 'confirm'}
            onClose={() => setModal('none')}
            alert
            size="sm"
            title="Delete the partner Debswana?"
            description="It disappears from the home page straight away. You can add it again later, but its logo will need uploading again."
            footer={<><Button variant="ghost" onClick={() => setModal('none')}>Keep it</Button><Button variant="danger" onClick={() => setModal('none')}>Delete partner</Button></>}
          >
            <p className="rounded-control bg-danger-soft text-danger text-d-label-s px-3 py-2.5">This cannot be undone.</p>
          </Modal>
        </Section>

        <Section figma="Components › Toast" title="Toast">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <ToastCard toast={{ title: 'Partner saved', body: 'Debswana now shows on the home page.', tone: 'success', action: { label: 'Undo', onClick: () => {} }, duration: 0 }} onClose={() => {}} />
            <ToastCard toast={{ title: 'Draft kept', body: 'Saved so far.', tone: 'info', duration: 0 }} onClose={() => {}} />
            <ToastCard toast={{ title: 'Some files are still uploading', body: 'Keep this page open.', tone: 'warning', duration: 0 }} onClose={() => {}} />
            <ToastCard toast={{ title: 'We could not save this', body: 'Check your connection and try again.', tone: 'error', action: { label: 'Try again', onClick: () => {} }, duration: 0 }} onClose={() => {}} />
          </div>
          <Button variant="secondary" size="sm" onClick={() => toast.show({ title: 'Partner saved', body: 'Debswana now shows on the home page.', tone: 'success' })}>Show a toast</Button>
        </Section>

        <Section figma="Components › States" title="Empty, error, not allowed, loading">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <EmptyState framed title="No partners yet" message="Partners appear on the home page strip. Add your first one to get started." action={<Button size="sm">Add partner</Button>} />
            <ErrorState framed title="We could not load the review queue" message="This is on our side. Your work is safe. Try again in a moment." onRetry={() => {}} />
            <ForbiddenState framed title="This area is for administrators" message="Ask an administrator if you need Users and roles." />
            <Card><Skeleton className="h-3 w-1/3 mb-3" /><Skeleton className="h-7 w-1/2 mb-3" /><SkeletonText lines={2} /></Card>
          </div>
          <EmptyState compact icon={Inbox} title="No entries yet" message="Share the challenge link to invite entries." steps={[{ label: 'Publish the challenge' }, { label: 'Share the link', description: 'WhatsApp works well.' }]} />
        </Section>

        <Section figma="Avatar · Pagination · LanguageSwitch" title="Small parts">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="Neo Mosweu" size="xs" />
            <Avatar name="Neo Mosweu" size="sm" />
            <Avatar name="Neo Mosweu" size="md" />
            <Avatar name="Neo Mosweu" size="lg" />
            <Pagination page={page} totalPages={9} onChange={setPage} />
            <span className="bg-banner px-3 py-2 rounded-control"><LanguageSwitch tone="dark" /></span>
          </div>
        </Section>
      </div>
    </div>
  )
}
