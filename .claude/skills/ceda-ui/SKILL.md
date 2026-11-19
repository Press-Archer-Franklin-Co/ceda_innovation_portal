---
name: ceda-ui
description: "Read before adding or changing any screen, component, table, tab, modal, form, page header, status chip, empty, loading or error state, or menu item in innovation_portal_admin or innovation_portal_public. Defines the shared components to reuse, the Option D look, compact staff density, the CEDA status words, honest states that never show made-up data, plain language in English and Setswana."
---

# CEDA Innovation Portal: UI system

Two frontends, one look:
- `innovation_portal_public`: the public site and the innovator's space (React 18, TypeScript, Vite, Tailwind).
- `innovation_portal_admin`: the staff console under `/staff` (React 19, JavaScript, Vite, Tailwind, TanStack Query, framer-motion).

Design source of truth: Figma "CEDA Innovation Portal · UI (Option D)",
https://www.figma.com/design/dzLeXDnM9ldZEurtYDcIh2. The **Foundations** page
holds the colours, type styles and every component named below. If a screen
needs something Foundations does not show, ask; do not invent a style.

## The one rule: reuse, then extend, then build

Before writing any component:

1. Search `src/components/ui/` in **that** app.
2. **Reuse** the shared component if it fits.
3. **Extend** it with a prop if the need is general (a `size`, a `tone`, a
   `count`). A new prop beats a new component.
4. **Build** something new only when nothing can express the need, and put it in
   `src/components/ui/` with a line in the app's `/styleguide` page, so the next
   screen finds it.

Never build a page-only visual system. If a page needs a look the system cannot
give, the system has a gap: fix it in `components/ui/`.

## 1. The shared components

| Need | Admin (`src/components/ui/`) | Public (`src/components/ui/`) |
|---|---|---|
| Dialog / confirmation | `Modal.jsx` with genie motion, `ConfirmDialog.jsx` | `Modal.tsx` with genie motion, `ConfirmDialog.tsx` |
| Table (data already in the browser) | `DataTable.jsx` | (public pages have no data tables) |
| Table (server pages the data) | `ServerTable.jsx` (build when first needed) | |
| Tabs | `Tabs.jsx` | `Tabs.tsx` (build from admin's shape) |
| Page title block | `PageHeader.jsx` | `SectionHeader.tsx`, `StandardHero.tsx` |
| Status chip | `StatusPill.jsx` (see section 6) | `Badge.tsx` |
| Button, Input, FormField | from U1 | `Button.tsx`, `FormField.tsx` |
| Choose one | `Select.jsx` (searchable) | `Select.tsx` (searchable) |
| Choose several | `MultiSelect.jsx` (searchable, chips) | only if a form needs it |
| Card | `SectionCard.jsx`, `StatCard.jsx` | `Card.tsx` |
| Loading | `LoadingSkeleton.jsx` | `SkeletonCard.tsx` |
| Empty | `EmptyState.jsx` | `EmptyState.tsx` |
| Error | `ErrorState.jsx` | `ErrorState.tsx` (build) |
| Toast | `Toast.jsx` (build) | `Toast.tsx` (build) |
| Menu of actions | `DropdownMenu.jsx` (build, genie motion) | same |
| Popover | `Popover.jsx` (build, genie motion) | same |
| Step progress (segmented bars) | `StepProgress.jsx` | `StepProgress.tsx` |
| Language switch | `LanguageSwitch.jsx` | `LanguageSwitch.tsx` |

Motion for Modal, Popover, DropdownMenu and Toast is defined in the
`ceda-genie-motion` skill. Read it before touching any of them.

**Never** use `window.confirm`, `window.alert` or `window.prompt`. Use
`ConfirmDialog`. A destructive confirmation names the thing ("Delete the
partner Debswana?"), says what happens, and puts the red action last.

## 2. Look and feel (Option D)

- **Page background**: pure white in light mode, neutral grey (`#1C1C1E` family)
  in dark mode. Never tint the page background.
- **Banners and feature cards**: chocolate `#5A3C32` is welcome there.
- **Actions**: CEDA red `#A01E0A` for the primary button. Amber and orange for
  highlights only. Exact values come from Figma variables, never hand-typed hex.
- **Type**: Montserrat for headings, Lato for body text.
- **Radius**: 8 for controls, 12 for cards and dialogs.
- **Logo**: the real CEDA logo and mark from Figma, never redrawn.
- **Tone**: simple and calm, Apple-like. Public pages have no charts. Staff
  pages may.
- **Every screen** works at desktop (1440) and phone (390). Check both.

## 3. Density

Public pages are roomy. Staff pages are **compact by default** and get roomier
only on large screens. Design for a 1366 x 768 laptop first, because that is the
CEDA office laptop.

| Element (staff console) | Compact (default) | Comfortable (`2xl:` and up) |
|---|---|---|
| Sidebar width | 216px | 248px |
| Sidebar row | 32px, 13px text | 38px, 14px text |
| Page header block | 64px max | 88px max |
| Page title | 18px | 22px |
| Card padding | 14px | 22px |
| Table header row | 32px, 11px caps | 36px |
| Table row | 36px, 13px | 44px |
| Tab strip | 36px | 40px |
| Button | 32px | 36px |
| Gap between sections | 14px | 22px |

**Acceptance**: at 1366 x 768 the whole staff sidebar is visible without
scrolling, and a normal staff page fits in about one screen (two at most,
unless the table *is* the page).

**Never** use CSS `zoom` or `transform: scale()` to fit more on screen. It blurs
text and breaks click targets. Use smaller type and tighter spacing.

## 4. Tables

A screen supplies columns and cells. It does not restyle the table.

```
toolbar   search · filters (Select / MultiSelect)          actions on the right
header    32px, sortable columns show the sort arrow
rows      36px; status column uses StatusPill; row actions on the right
states    skeleton rows while loading · a message row when empty · error row with Retry
footer    rows per page + pager, only when there is more than one page
```

- Loading keeps the columns: show skeleton **rows**, not one grey box.
- Empty says what would put data here ("No ideas yet for this challenge. Share
  the challenge link to invite entries.") and offers the next step.
- A row is a target: the whole row opens the record, and the name cell is a
  real link so keyboard and "open in new tab" work.
- Each row action is shown only if this person may do it (see `ceda-security`).
- Wide tables scroll sideways **inside** the table. The page never scrolls sideways.
- On phone, a table becomes a stacked card list with the same fields in the same order.
- Data the server pages (submissions, users, audit log) uses `ServerTable` with
  `?page=&page_size=&ordering=&search=`. Do not fetch everything and sort in the browser.

## 5. Tabs

- One `Tabs` component per app.
- Counts sit in a small muted pill: `Entries 12`.
- Below `lg`, the strip scrolls sideways. Labels never wrap.
- A tab whose data the person cannot read is **not shown**, and the default tab
  is the first one they can see.
- The selected tab lives in the URL (`?tab=faqs`), as `/content?tab=leadership` already does.

## 6. Status words

One chip component, one set of words, sentence case. Screens map the API value
to **these** words in one place per area. **Never show a raw API value** like
`requires_more_information` or a humanised one like "Requires More Information".

| Word on screen | Tone | Means | API values today |
|---|---|---|---|
| Draft | muted | not sent yet | `draft` |
| Submitted | info | sent, nobody has picked it up | `submitted` |
| In review | info | an officer or panel is looking | `screening`, `review`, `under_review`, `in_review`, `judging_review`, `assigned_to_judges`, `under_judging`, `in_evaluation` |
| Needs your input | warning | waiting on the innovator | `requires_more_information`, `returned`, `returned_for_correction` |
| Shortlisted | highlight (amber) | through to the next round | `shortlisted`, `finalist`, `selected_for_hackathon` |
| Approved | success | accepted | `approved`, `evaluated` |
| Winner | success, gold dot | won | `winner` |
| Not taken forward | danger | did not proceed | `rejected`, `screened_out` |
| Open / Closed / Upcoming | success / muted / info | a challenge's window (never "Coming soon") | `open`, `closed`, `upcoming` |
| Published / Scheduled / Waiting for approval / Archived | success / info / warning / muted | website content ("Live" on screen becomes "Published") | `published`, `scheduled`, `pending_approval`, `archived` |
| Assigned / In progress / Done | info / info / success | staff tasks | `assigned`, `claimed`, `in_progress`, `completed` |
| Not known | muted, dashed border | the value did not arrive | missing or unrecognised |

Notes:
- "Not taken forward" is kinder than "Rejected" for an innovator. Staff screens
  may show "Rejected" if the officers prefer; decide once and keep it.
- **An unknown value shows "Not known"**, never a guessed label. Today
  `StatusPill` humanises unknown keys; change that.
- Colour never carries the meaning alone: the chip always has words.
- Every word has a Setswana version in the `tn` strings file.

## 7. States: never say something false

| State | Use | Rule |
|---|---|---|
| Whole-page wait (auth) | the CEDA mark loader | only while we do not know who the person is |
| Table loading | skeleton rows | keep the columns |
| Card loading | skeleton at the card's real height | never collapse then jump |
| Empty | `EmptyState` | icon, what is missing, what to do next |
| Error | `ErrorState` | what failed, in plain words, and a Retry button |
| Not allowed | the forbidden state | says who to ask |

**Loading and failure are not "empty".** If a list has not arrived, or failed,
do not render "No partners yet". That is a confident false statement about the
person's own data. Show the skeleton, or the error.

**A query that is switched off is not "loading".** In TanStack Query a query
with `enabled: false` is `isPending` for ever. Use `isLoading` for spinners. Use
`isPending && fetchStatus === 'idle'` to mean "not part of your role", and then
show nothing, not a skeleton that never ends.

**Never invent numbers.** No demo figures, no sample charts, no "P 1.2m funded"
placeholder on a live page. If the API cannot answer yet, the card is not shown
or says "Not available yet". Mock data lives only in tests and the styleguide.

**Keep the old numbers during a refresh** (`placeholderData: keepPreviousData`)
so cards do not blank out when a filter changes.

## 8. Plain language, two languages

Staff and innovators are not reading the database. Normal UI never shows:
`UUID`, `id`, `pk`, `Program` (say **Challenge**), `Submission` (say **Idea** or
**Entry**), raw status values, internal codes, or stack traces.

- Say: Idea, Challenge, Entry, Officer, Panel, Marking criteria, Partner, News, Bulletin.
- Technical ids go in a "Technical details" disclosure for staff only.
- Write like a helpful officer: short sentences, active voice, no jargon.
- Light wordplay is welcome on public headings ("Got an idea? Let's grow it."),
  never in errors or legal text.
- **Every UI string goes through the i18n layer** with an `en` and a `tn` entry.
  No hard-coded English in components. Content text arrives translated from the
  API; UI chrome comes from the strings files.
- Leave room: Setswana strings run about 20 to 30% longer. Buttons and tabs must
  not clip; test with `tn`.
- No em dashes anywhere (see the `plain-writing` skill).

## 9. Forms

- `FormField` wraps every control: real `<label htmlFor>`, help text, and the
  error under the field with `role="alert"`, tied by `aria-describedby`.
- Choose one from a list: the searchable `Select`. Choose several: `MultiSelect`.
  No raw `<select>`.
- A handful of fixed options that are the information itself (Yes / No, three
  sectors) are radio buttons or checkboxes, not a dropdown.
- Long lists (districts, partners, judges) always use the searchable controls.
- Actions bottom right: ghost Cancel, then the primary action last. The primary
  button shows a pending state and is disabled while saving.
- Long forms use `StepProgress` (segmented bars: red done with a green "Done",
  amber current, beige to do, labels "1 · About you") and save each step.
- "Add" and "Edit" for the same thing are the same form with different starting values.

## 10. Accessibility floor

Real labels on every input · `aria-label` on icon-only buttons · visible focus
rings · text contrast 4.5:1 · tab order follows what you see · status never by
colour alone · `role="alert"` on errors · `prefers-reduced-motion` respected
(the genie falls back to a fade) · touch targets at least 44px on phone.

## 11. Data fetching (admin)

TanStack Query is the only way the console talks to the API.

- Query keys live in `src/lib/queries/keys.js` as factories and are
  **hierarchical**, so invalidating a parent refreshes its children:
  `['challenges']`, `['challenges', id]`, `['challenges', id, 'entries']`.
- Do not copy server data into `useState` unless the person is editing it.
- After a save: invalidate the affected keys. Never reload the page.
- Prefetch a dialog's data on hover or press of its trigger (see the genie skill).

The public app uses axios services in `src/services/`. If it adopts TanStack
Query later, follow the same key rules.

## 12. Before you say it is done

- [ ] Reused or extended a shared component; anything new is in `components/ui/` and the styleguide.
- [ ] Matches the Figma frame on desktop and phone.
- [ ] Loading, empty, error and not-allowed states all exist and say true things.
- [ ] No raw API values, no made-up numbers, no English hard-coded outside the strings files.
- [ ] Checked with Setswana strings.
- [ ] Staff page fits 1366 x 768 without sidebar scrolling.
- [ ] The `verify-work` skill has run and passed.
