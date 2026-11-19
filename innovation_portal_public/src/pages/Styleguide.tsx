import { ReactNode, useRef, useState } from 'react'
import { Bell, Inbox, Pencil, Plus, Share2, Trash2 } from 'lucide-react'
import Button from '../components/ui/Button'
import Tag, { NewCue, TagTone } from '../components/ui/Tag'
import Input from '../components/ui/Input'
import Textarea from '../components/ui/Textarea'
import Select from '../components/ui/Select'
import { Checkbox, Radio, RadioGroup, Toggle } from '../components/ui/Choice'
import Card from '../components/ui/Card'
import Tabs from '../components/ui/Tabs'
import Modal from '../components/ui/Modal'
import { ToastCard, useToast } from '../components/ui/Toast'
import Avatar from '../components/ui/Avatar'
import EmptyState, { ErrorState, ForbiddenState } from '../components/ui/EmptyState'
import Skeleton, { SkeletonBlock, SkeletonText } from '../components/ui/Skeleton'
import Pagination from '../components/ui/Pagination'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import StepProgress from '../components/ui/StepProgress'
import Logo, { CedaMark } from '../components/ui/Logo'
import { useI18n } from '../i18n'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Popover from '../components/ui/Popover'
import DropdownMenu from '../components/ui/DropdownMenu'
import Badge from '../components/ui/Badge'
import PageSkeleton from '../components/ui/PageSkeleton'
import { STATUS_VALUES } from '../lib/status'

// Dev-only page (/styleguide). Every shared component and state, labelled with its Figma frame on
// Foundations (https://www.figma.com/design/dzLeXDnM9ldZEurtYDcIh2). Sample text here is for display only.

function Section({ figma, title, children }: { figma: string; title: string; children: ReactNode }) {
  return (
    <section className="py-8 border-b border-border">
      <p className="text-d-over uppercase text-accent">{figma}</p>
      <h2 className="text-d-h3 font-heading text-text mt-1 mb-5">{title}</h2>
      {children}
    </section>
  )
}

const swatches = [
  'bg', 'surface', 'surface2', 'border', 'text', 'muted', 'banner', 'banner-deep', 'banner-muted', 'primary', 'primary-soft',
  'accent', 'accent-soft', 'amber', 'yellow', 'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft',
  'info', 'info-soft', 'cms', 'cms-soft', 'scrim',
]

const type: [string, string][] = [
  ['text-d-h1 font-heading', 'D/h1 · Plant the seed.'],
  ['text-d-h2 font-heading', 'D/h2 · Open calls from CEDA'],
  ['text-d-h3 font-heading', 'D/h3 · Agribusiness Value-Add'],
  ['text-d-h4 font-heading', 'D/h4 · Start your idea in 2 minutes'],
  ['text-d-h5 font-heading', 'D/h5 · Neo · Catering · Gabane'],
  ['text-d-mh1 font-heading', 'D/mh1 · Mobile hero 34'],
  ['text-d-body', 'D/body · Innovation is not only technology.'],
  ['text-d-body-s', 'D/bodyS · Supporting copy and card text.'],
  ['text-d-label', 'D/label · Form labels and links'],
  ['text-d-cap', 'D/cap · Captions, dates and hints'],
  ['text-d-over uppercase font-heading', 'D/over · Overline · section kicker'],
  ['text-d-btn font-heading', 'D/btn · Button label'],
]

const tones: TagTone[] = ['neutral', 'red', 'orange', 'green', 'amber', 'blue', 'new', 'dark', 'cms', 'selected', 'unknown']

const districts = ['Central', 'Chobe', 'Ghanzi', 'Kgalagadi', 'Kgatleng', 'Kweneng', 'North East', 'North West', 'South East', 'Southern'].map((d) => ({ value: d, label: d }))

export default function Styleguide() {
  const { lang, setLang } = useI18n()
  const toast = useToast()
  const [dark, setDark] = useState(false)
  const [tab, setTab] = useState('entries')
  const [district, setDistrict] = useState<string | null>(null)
  const [sector, setSector] = useState<'yes' | 'no' | null>('yes')
  const [toggle, setToggle] = useState(true)
  const [stage, setStage] = useState<'idea' | 'tested' | 'selling' | null>('tested')
  const [page, setPage] = useState(5)
  const [step, setStep] = useState(1)
  const [modal, setModal] = useState<'none' | 'form' | 'confirm'>('none')
  const [pitch, setPitch] = useState('A cold room shared by farmers in Gabane.')
  const formRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [bellOpen, setBellOpen] = useState(false)
  const [skeleton, setSkeleton] = useState<'list' | 'detail' | 'stats' | 'form'>('list')

  const switchTheme = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }

  return (
    <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-d-over uppercase text-accent">Option D · CEDA portal</p>
          <h1 className="text-d-mh1 lg:text-d-h2 font-heading">Styleguide (public)</h1>
          <p className="text-d-body-s text-muted mt-1">Dev only. Labels match Figma › Foundations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LanguageSwitch />
          <Button variant="secondary" size="sm" onClick={() => setLang(lang === 'en' ? 'tn' : 'en')}>Lang: {lang}</Button>
          <Toggle label="Dark (draft)" checked={dark} onChange={switchTheme} />
        </div>
      </div>

      <Section figma="Foundations board › Colours" title="Colour tokens">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
          {swatches.map((s) => (
            <div key={s}>
              <div className="h-12 rounded-control border border-border" style={{ background: `rgb(var(--c-${s}))` }} />
              <p className="text-d-cap text-muted mt-1">{s}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section figma="Foundations board › Type" title="Type ramp">
        <div className="space-y-3">
          {type.map(([cls, text]) => (
            <p key={cls} className={`${cls} text-text`}>{text}</p>
          ))}
        </div>
      </Section>

      <Section figma="Components › Brand" title="CEDA mark and Logo">
        <div className="flex flex-wrap items-center gap-6">
          <CedaMark height={80} label="CEDA" />
          <Logo />
          <Logo theme="dark" />
        </div>
      </Section>

      <Section figma="Components › Buttons" title="Button">
        {(['md', 'sm'] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-3 mb-3">
            <Button size={size} arrow>Primary</Button>
            <Button size={size} variant="accent" arrow>Accent</Button>
            <Button size={size} variant="secondary" arrow>Secondary</Button>
            <Button size={size} variant="soft">Soft</Button>
            <Button size={size} variant="ghost" arrow>Ghost</Button>
            <span className="bg-banner p-2 rounded-control inline-flex"><Button size={size} variant="onDark" arrow>On dark</Button></span>
            <Button size={size} variant="danger">Danger</Button>
            <Button size={size} variant="link">Link</Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
          <Button variant="secondary" disabled>Disabled</Button>
          <Button icon={<Plus size={18} aria-hidden />}>With icon</Button>
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
          <Tag tone="blue" dot>In review</Tag>
          <Tag tone="amber" dot>Needs your input</Tag>
          <Tag tone="green" dot>Approved</Tag>
          <Tag tone="green" dot dotClassName="bg-yellow">Winner</Tag>
          <Tag tone="red" dot>Not taken forward</Tag>
          <Tag tone="unknown" dot />
          <NewCue />
          <span className="inline-flex items-center gap-2 text-d-label">Bulletin <NewCue dotOnly /></span>
        </div>
      </Section>

      <Section figma="Components › Status chips" title="Badge status: every API value and its word">
        <div className="flex flex-wrap gap-2">
          {[...Object.keys(STATUS_VALUES), 'something_new'].map((v) => (
            <span key={v} className="inline-flex flex-col items-start gap-0.5">
              <Badge status={v} />
              <code className="text-[10px] text-muted">{v}</code>
            </span>
          ))}
        </div>
      </Section>

      <Section figma="Components › Inputs" title="Input, Textarea, Select, choices">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Input label="Label" placeholder="Placeholder" hint="Hint" />
          <Input label="Label" defaultValue="Filled" hint="Hint" />
          <Input label="Label" placeholder="Placeholder" error="Enter your phone number" />
          <Input label="Label" placeholder="Disabled" disabled hint="Hint" />
          <Textarea label="Your idea in one line" maxChars={60} value={pitch} onChange={(e) => setPitch(e.target.value)} hint="Plain words are best." />
          <Select label="District" options={districts} value={district} onChange={setDistrict} hint="Type to search" required />
          <RadioGroup name="sg-yes" legend="Is it already running?" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} value={sector} onChange={setSector} inline />
          <div>
            <Checkbox label="I agree to the terms" description="You can read them any time." defaultChecked />
            <Checkbox label="Error state" invalid />
            <Radio name="sg-r" label="Radio on its own" />
            <Toggle label="Email me updates" checked={toggle} onChange={setToggle} />
          </div>
        </div>
      </Section>

      <Section figma="2.3 Submit an idea · How far along are you? (R-17)" title="RadioGroup variant=&quot;cards&quot;">
        <RadioGroup name="sg-stage" legend="How far along are you?" variant="cards" options={[{ value: 'idea', label: 'Just an idea', description: 'Not tried yet' }, { value: 'tested', label: 'Tested', description: 'Made a few, got feedback' }, { value: 'selling', label: 'Already selling', description: 'Some customers pay' }] as const} value={stage} onChange={setStage} />
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
        <Tabs
          className="mt-4"
          variant="segment"
          tabs={[{ key: 'overview', label: 'Overview' }, { key: 'entries', label: 'Entries', count: 12 }]}
          active={tab === 'entries' ? 'entries' : 'overview'}
          onChange={setTab}
        />
      </Section>

      <Section figma="Segmented progress (2.3, 3.4b, 3.5)" title="StepProgress">
        <StepProgress steps={['About you', 'Your idea', 'Evidence', 'Review']} current={step} saved onStepClick={setStep} />
        <div className="flex gap-3 mt-3">
          <Button size="sm" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
          <Button size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))}>Next</Button>
        </div>
      </Section>

      <Section figma="Components › Card" title="Card">
        <div className="grid sm:grid-cols-3 gap-4">
          <Card><p className="text-d-h4 font-heading">Plain</p><p className="text-d-body-s text-muted">White, 1px border, radius 12.</p></Card>
          <Card tone="soft"><p className="text-d-h4 font-heading">Soft</p><p className="text-d-body-s text-muted">Cream panel.</p></Card>
          <Card tone="banner" hover><p className="text-d-h4 font-heading">Banner</p><p className="text-d-body-s text-banner-muted">Chocolate feature card.</p></Card>
        </div>
      </Section>

      <Section figma="Components › Modal and confirm dialog · Genie motion" title="Modal and ConfirmDialog (genie from the button)">
        <div className="flex gap-3">
          <Button ref={formRef} variant="secondary" onClick={() => setModal('form')}>Add partner</Button>
          <Button ref={deleteRef} variant="danger" onClick={() => setModal('confirm')}>Delete partner</Button>
        </div>
        <Modal
          open={modal === 'form'}
          triggerRef={formRef}
          onClose={() => setModal('none')}
          title="Add partner"
          description="Partners show in the strip on the home page. You can hide them at any time."
          closeOnBackdrop={false}
          footer={<><Button variant="ghost" onClick={() => setModal('none')}>Cancel</Button><Button onClick={() => setModal('none')}>Save partner</Button></>}
        >
          <div className="space-y-4">
            <Input label="Organisation name" hint="As it should appear on the site" data-autofocus />
            <Input label="Website" placeholder="https://" optional />
          </div>
        </Modal>
        <ConfirmDialog
          open={modal === 'confirm'}
          triggerRef={deleteRef}
          onCancel={() => setModal('none')}
          onConfirm={() => setModal('none')}
          title="Delete the partner Debswana?"
          body="It disappears from the home page straight away. You can add it again later, but its logo will need uploading again."
          note="This cannot be undone."
          confirmLabel="Delete partner"
          cancelLabel="Keep it"
        />
      </Section>

      <Section figma="Components › Dropdown menu and popover" title="DropdownMenu and Popover">
        <div className="flex flex-wrap items-center gap-4">
          <DropdownMenu
            label="Actions for this idea"
            items={[
              { key: 'edit', label: 'Edit idea', icon: <Pencil size={16} />, onSelect: () => undefined },
              { key: 'share', label: 'Share on WhatsApp', icon: <Share2 size={16} />, onSelect: () => undefined },
              { key: 'delete', label: 'Delete draft', icon: <Trash2 size={16} />, danger: true, onSelect: () => setModal('confirm') },
            ]}
          />
          <button ref={bellRef} type="button" aria-expanded={bellOpen} aria-label="Notifications" onClick={() => setBellOpen((o) => !o)} className="w-10 h-10 rounded-full border border-border flex items-center justify-center">
            <Bell size={18} aria-hidden />
          </button>
          <Popover open={bellOpen} onClose={() => setBellOpen(false)} triggerRef={bellRef} align="end" label="Notifications" className="p-4">
            <p className="text-d-label text-text mb-1">Notifications</p>
            <p className="text-d-body-s text-muted">Nothing new. Replies from CEDA officers show here.</p>
          </Popover>
        </div>
      </Section>

      <Section figma="Components › Toast" title="Toast">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <ToastCard toast={{ title: 'Partner saved', body: 'Debswana now shows on the home page.', tone: 'success', action: { label: 'Undo', onClick: () => undefined }, duration: 0 }} onClose={() => undefined} />
          <ToastCard toast={{ title: 'Draft kept', body: 'We saved your idea so far. Finish it any time.', tone: 'info', duration: 0 }} onClose={() => undefined} />
          <ToastCard toast={{ title: 'Some files are still uploading', body: 'Keep this page open until they finish.', tone: 'warning', duration: 0 }} onClose={() => undefined} />
          <ToastCard toast={{ title: 'We could not save this', body: 'Check your connection and try again.', tone: 'error', action: { label: 'Try again', onClick: () => undefined }, duration: 0 }} onClose={() => undefined} />
        </div>
        <Button variant="secondary" size="sm" onClick={() => toast.show({ title: 'Partner saved', body: 'Debswana now shows on the home page.', tone: 'success', action: { label: 'Undo', onClick: () => undefined } })}>Show a toast</Button>
      </Section>

      <Section figma="Components › States" title="Empty, error, not allowed, loading">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <EmptyState title="No partners yet" body="Partners appear on the home page strip. Add your first one to get started." action={{ label: 'Add partner', onClick: () => undefined }} />
          <ErrorState title="We could not load the review queue" body="This is on our side. Your work is safe. Try again in a moment." onRetry={() => undefined} />
          <ForbiddenState title="This area is for administrators" body="Ask an administrator if you need Users and roles." />
          <SkeletonBlock />
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <EmptyState icon={Inbox} framed={false} title="No ideas yet" body="Ideas you send show here." />
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><SkeletonText lines={3} /></div>
        </div>
      </Section>

      <Section figma="States · page loading" title="PageSkeleton">
        <Tabs className="mb-3" variant="segment" tabs={(['list', 'detail', 'stats', 'form'] as const).map((k) => ({ key: k, label: k }))} active={skeleton} onChange={setSkeleton} />
        <PageSkeleton shape={skeleton} />
      </Section>

      <Section figma="Avatar · Pagination · LanguageSwitch" title="Small parts">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Neo Mosweu" size="xs" />
          <Avatar name="Neo Mosweu" size="sm" />
          <Avatar name="Neo Mosweu" size="md" />
          <Avatar name="Neo Mosweu" size="lg" />
          <Pagination page={page} totalPages={12} onChange={setPage} />
          <span className="bg-banner px-3 py-2 rounded-control"><LanguageSwitch tone="dark" /></span>
        </div>
      </Section>
    </div>
  )
}
