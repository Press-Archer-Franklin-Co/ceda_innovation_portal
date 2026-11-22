import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Copy, Pencil, Trash2 } from 'lucide-react'
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
import Logo, { BrandLockup, CedaMark } from '../components/ui/Logo'
import BrandLoader from '../components/ui/BrandLoader'
import { createBoot } from '../lib/boot'
import PageHeader from '../components/ui/PageHeader'
import SectionCard from '../components/ui/SectionCard'
import Sidebar from '../layout/Sidebar'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Popover from '../components/ui/Popover'
import DropdownMenu from '../components/ui/DropdownMenu'
import StatusPill from '../components/ui/StatusPill'
import DataTable from '../components/ui/DataTable'
import MultiSelect from '../components/ui/MultiSelect'
import PageSkeleton from '../components/ui/PageSkeleton'
import AddPartnerDialog from '../components/content/AddPartnerDialog'
import { STATUS_VALUES } from '../lib/status'
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
// Every capability, so the shell preview shows the full menu.
const previewAdmin = {
  first_name: 'Preview', last_name: 'Admin',
  capabilities: ['analytics.view', 'audit.view', 'challenges.manage', 'content.approve', 'content.edit', 'criteria.manage', 'dashboard.view', 'entries.assign', 'entries.review', 'entries.score', 'entries.search', 'forms.manage', 'reports.export', 'settings.manage', 'users.manage'],
}

export default function Styleguide() {
  const { lang, setLang } = useI18n()
  const toast = useToast()
  const [dark, setDark] = useState(false)
  const [tab, setTab] = useState('entries')
  const [judge, setJudge] = useState(null)
  const [yes, setYes] = useState('yes')
  const [toggle, setToggle] = useState(true)
  const [stage, setStage] = useState('tested')
  const [page, setPage] = useState(3)
  const [step, setStep] = useState(1)
  const [modal, setModal] = useState('none')
  const [note, setNote] = useState('Strong local demand; needs a costed plan.')
  const missing = missingTranslations()
  const addRef = useRef(null)
  const deleteRef = useRef(null)
  const bellRef = useRef(null)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [panel, setPanel] = useState([])
  const [tableState, setTableState] = useState('rows')
  const [skeleton, setSkeleton] = useState('list')
  const fakeApi = {
    uploadImage: async () => ({ id: 'logo-1' }),
    partners: {
      create: (body) => new Promise((resolve) => setTimeout(() => resolve({ id: 'p-1', ...body }), 600)),
      remove: async () => null,
    },
  }

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

        <Section figma="PageHeader" title="Many actions wrap on a phone (R-24)">
          <div id="sg-pageheader-many" className="rounded-card border border-border p-4">
            <PageHeader
              title="Idea form"
              subtitle="Six actions, like the form builder."
              actions={
                <>
                  <span className="text-d-cap text-muted">Saved</span>
                  <Button variant="ghost" size="sm">Undo</Button>
                  <Button variant="ghost" size="sm">Redo</Button>
                  <LanguageSwitch />
                  <Button variant="secondary" size="sm">Preview</Button>
                  <Button size="sm">Publish</Button>
                </>
              }
            />
          </div>
        </Section>

        <Section figma="Shell (U12 lit menu)" title="Sidebar (as an administrator), lit open and dim rail">
          <ShellPreview />
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

        <Section figma="Components › Brand (U12)" title="CEDA mark, Logo and BrandLockup">
          <div className="flex flex-wrap items-center gap-6">
            <CedaMark height={64} label="CEDA" />
            <Logo />
            <Logo theme="dark" subtitle="Staff console" />
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-4">
            <div className="p-6 rounded-card border border-border bg-bg"><BrandLockup width={240} /></div>
            <div className="p-6 rounded-card bg-banner"><BrandLockup width={240} theme="dark" /></div>
          </div>
        </Section>

        <Section figma="Components › Brand loader (U12)" title="BrandLoader: the idea bulb">
          <LoaderPreview />
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

        <Section figma="Components › Status chips" title="StatusPill: every API value and its word">
          <div className="flex flex-wrap gap-2">
            {[...Object.keys(STATUS_VALUES), 'something_new'].map((v) => (
              <span key={v} className="inline-flex flex-col items-start gap-0.5">
                <StatusPill status={v} />
                <code className="text-[10px] text-muted">{v}</code>
              </span>
            ))}
          </div>
        </Section>

        <Section figma="Components › Data table (compact)" title="DataTable: rows, loading, empty, error (phone: cards below md)">
          <Tabs className="mb-3" variant="segment" tabs={['rows', 'loading', 'empty', 'error'].map((k) => ({ key: k, label: k }))} active={tableState} onChange={setTableState} />
          <div className="rounded-card border border-border overflow-hidden">
            <DataTable
              toolbar={<span className="text-[13px] text-muted">Toolbar: search and filters on the left, actions on the right</span>}
              columns={[
                { key: 'title', label: 'Idea', sortable: true, link: (r) => `/submissions/${r.id}` },
                { key: 'district', label: 'District', sortable: true, width: 140 },
                { key: 'status', label: 'Status', width: 170, render: (v) => <StatusPill status={v} /> },
                { key: 'score', label: 'Score', width: 90, align: 'right', sortable: true },
              ]}
              data={tableState === 'rows' ? [
                { id: 'a', title: 'Shared cold room for Gabane farmers', district: 'Kweneng', status: 'under_review', score: 78 },
                { id: 'b', title: 'Solar water pumps for cattle posts', district: 'Central', status: 'shortlisted', score: 84 },
                { id: 'c', title: 'Mobile tailoring school', district: 'South East', status: 'requires_more_information', score: null },
                { id: 'd', title: 'Mophane worm packaging', district: 'North East', status: 'winner', score: 91 },
              ] : []}
              loading={tableState === 'loading'}
              error={tableState === 'error' ? 'We could not load the review queue.' : null}
              onRetry={() => setTableState('rows')}
              emptyTitle="No ideas yet for this challenge"
              emptyMessage="Share the challenge link to invite entries."
              pageSize={3}
            />
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
            <MultiSelect label="Panel" options={judges} value={panel} onChange={setPanel} hint="Choose several. Backspace removes the last." />
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

        <Section figma="2.3 Submit an idea · How far along are you? (R-17)" title="RadioGroup variant=&quot;cards&quot;">
          <RadioGroup name="sg-stage" legend="How far along are you?" variant="cards" options={[{ value: 'idea', label: 'Just an idea', description: 'Not tried yet' }, { value: 'tested', label: 'Tested', description: 'Made a few, got feedback' }, { value: 'selling', label: 'Already selling', description: 'Some customers pay' }]} value={stage} onChange={setStage} />
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

        <Section figma="Components › Modal and confirm dialog · Genie motion" title="Modal and ConfirmDialog (genie from the button)">
          <p className="text-[13px] text-muted mb-3">Add partner saves through a fake API here and shows a toast with Undo. Set DevTools Animations to 10% to watch the genie.</p>
          <div className="flex flex-wrap gap-2.5">
            <Button ref={addRef} icon={<Plus size={14} aria-hidden />} onClick={() => setAddOpen(true)}>Add partner</Button>
            <Button ref={deleteRef} variant="danger" icon={<Trash2 size={14} aria-hidden />} onClick={() => setConfirmOpen(true)}>Delete partner</Button>
          </div>
          <AddPartnerDialog open={addOpen} onClose={() => setAddOpen(false)} triggerRef={addRef} api={fakeApi} />
          <ConfirmDialog
            open={confirmOpen}
            triggerRef={deleteRef}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => setConfirmOpen(false)}
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
              label="Actions for Debswana"
              items={[
                { key: 'edit', label: 'Edit partner', icon: <Pencil size={14} />, onSelect: () => {} },
                { key: 'copy', label: 'Duplicate', icon: <Copy size={14} />, onSelect: () => {} },
                { key: 'hidden', label: 'Only for admins', hidden: true },
                { key: 'delete', label: 'Delete partner', icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirmOpen(true) },
              ]}
            />
            <DropdownMenu label="More" trigger={(props) => <Button {...props} variant="secondary" size="sm">More actions</Button>} items={[{ key: 'a', label: 'Archive challenge' }, { key: 'b', label: 'Export entries (CSV)' }]} />
            <button ref={bellRef} type="button" className="btn-icon" aria-expanded={bellOpen} aria-label="Notifications" onClick={() => setBellOpen((o) => !o)}>
              <Bell size={18} aria-hidden />
            </button>
            <Popover open={bellOpen} onClose={() => setBellOpen(false)} triggerRef={bellRef} align="end" label="Notifications" className="p-3">
              <p className="text-[14px] font-bold text-text mb-2">Notifications</p>
              <p className="text-[13px] text-muted">Nothing new. We will show replies from applicants and judges here.</p>
            </Popover>
          </div>
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

        <Section figma="States · page loading" title="PageSkeleton (the fallback while a page loads)">
          <Tabs className="mb-3" variant="segment" tabs={['list', 'detail', 'stats', 'form'].map((k) => ({ key: k, label: k }))} active={skeleton} onChange={setSkeleton} />
          <PageSkeleton shape={skeleton} />
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

/** The loader with a pretend start-up of three steps, so it can be watched again. */
function LoaderPreview() {
  const [run, setRun] = useState(0)
  const boot = useMemo(() => createBoot(['me', 'config', 'page'], { timeoutMs: 0 }), [run]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ids = [700, 1500, 2300].map((ms, i) => setTimeout(() => boot.done(boot.steps[i]), ms))
    return () => ids.forEach(clearTimeout)
  }, [boot])
  return (
    <div>
      <Button size="sm" onClick={() => setRun((n) => n + 1)}>Replay</Button>
      <div className="relative mt-3 h-[480px] rounded-card border border-border overflow-hidden" style={{ transform: 'translateZ(0)' }}>
        <BrandLoader key={run} boot={boot} intro contained />
      </div>
    </div>
  )
}

/** The staff shell with the lit menu: Collapse and Expand play the real motion. */
function ShellPreview() {
  const [open, setOpen] = useState(true)
  const shellRef = useRef(null)
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)} disabled={!open}>Collapse</Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={open}>Expand</Button>
      </div>
      <div ref={shellRef} className="relative h-[720px] rounded-card border border-border overflow-hidden" style={{ transform: 'translateZ(0)', '--sidebar-current': open ? 'var(--sidebar-width)' : 'var(--sidebar-rail)' }}>
        <LayoutContext.Provider value={{ sidebarOpen: open, mobileSidebarOpen: false, setSidebarOpen: setOpen, setMobileSidebarOpen: () => {}, phone: false, shellRef }}>
          <Sidebar previewUser={previewAdmin} />
        </LayoutContext.Provider>
        <div className="absolute inset-y-0 right-0 bg-bg p-4" style={{ left: 'var(--sidebar-current)' }}>
          <PageHeader title="Review queue" subtitle="Ideas waiting for a first look." actions={<Button size="sm" icon={<Plus size={14} aria-hidden />}>Add challenge</Button>} />
          <SectionCard title="Entries" subtitle="Skeleton rows keep the columns while loading" padding={false}>
            <SkeletonTable rows={5} cols={5} />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
