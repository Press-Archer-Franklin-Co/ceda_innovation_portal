---
name: ceda-user-scope
description: "Read before adding or changing any page, menu item, tab, dashboard card, report or user-facing data in the CEDA Innovation Portal. Defines who sees what (guest, innovator, judge, officer, manager, admin), how menus come from capabilities, the overview / drill-down / tab / page decision rule, page size limits and the things never to ship."
---

# CEDA user scope: everyone sees their part, and nothing else

A signed-in person must always be able to answer: **where am I, what is mine,
and what do I do next?** They see what they may use and nothing else.

## 1. Who the people are

| Person | App | Sees |
|---|---|---|
| Guest | public | home, challenges, news and bulletin, stories, help; can start an idea (2-minute guest start) |
| Innovator | public, signed in | all of the above plus **My ideas**, messages from officers, notifications, profile |
| Judge / reviewer | staff | **only** the entries assigned to them and their marking forms |
| Mentor, specialist | staff | their assigned tasks |
| Innovation officer | staff | review queue, entries, challenges, website content |
| Innovation manager, analyst, management viewer | staff | dashboard, reports, analytics; read-only unless the capability map says otherwise |
| Administrator | staff | everything, including users, roles and platform settings |

The exact split is the **capability map** on the server (`ceda-security`
section 2). This table explains it; it does not replace it.

## 2. Visibility rules

1. **What a person cannot use is absent.** Not greyed out, not locked, not
   "coming soon". A disabled menu item tells someone there is a room they are
   kept out of, which helps nobody.
2. **No placeholder pages.** If a feature is not built, it has no route and no
   menu entry. (WhatsApp and USSD channels appear only once they work.)
3. **Never decide visibility from a role name, an email, `is_superuser` in the
   browser, or a count.** Ask `can(...)`.
4. **A judge sees only their assigned entries.** The list endpoint filters to
   assignments for `request.user`; the frontend never filters a bigger list down.
   Innovator names are hidden from judges when the challenge is set to blind review.
5. **An innovator sees only their own ideas and messages.** Officer notes marked
   internal never reach the public API.
6. **An unknown item from the server is dropped, not drawn.** If the API returns
   a menu section or card type the frontend does not know, skip it rather than
   showing a blank box.
7. **Landing page follows the person.** A judge lands on My reviews, an officer on
   the review queue, a manager on the dashboard. The landing page is always one
   their own sidebar offers.

## 3. Staff menu shape (Option D)

```
Overview        Dashboard · Reports · Review queue
Challenges      Challenges · Marking criteria · Form builder
Website content Home page · News & bulletin · Stories · Leadership quotes · Partners & sponsors · FAQs
Admin           Users & roles · Settings
```

- Groups and entries come from one list, `src/layout/nav.js`, each entry with its
  capability. A group with no visible entries is not shown.
- A person with one job gets a short menu. A judge with only `entries.review`
  sees **My reviews** and nothing else: no empty group headings.
- Active state matches whole path segments (`/content` lights for
  `/content/news/3`, but `/content` does not light for `/contents-archive`).
  Never `pathname.startsWith(href)` alone.
- Breadcrumbs read the same filtered list, so they never name a page the person
  cannot open.

## 4. Where a new thing goes: overview, drill-down, tab, or page

Ask in this order and stop at the first yes:

| Put it | When |
|---|---|
| **On the overview** | it is part of the headline answer the person wants without asking |
| **Behind a drill-down** | it explains one number or row already on screen |
| **As a tab** | it is another view of the same thing, with the same filters, that people compare |
| **As its own page** | it is a different errand with its own search, paging or export |

Applied to CEDA:
- **Review queue** is a page: searching, filtering and working through entries is an errand.
- **Challenge detail** tabs: Overview · Entries · Form · Marking criteria · Judges · Results. Same challenge, different views.
- **Reports** is a page: downloading a file is its own errand.
- **Leadership quotes, FAQs, partners** sit as tabs under Website content today
  (`/content?tab=...`). Keep it; do not give each one a sidebar entry.

**Do not add a sidebar item per feature.** The sidebar names areas of work, not features.

## 5. Dashboards

- **The overview is a hub, not a report.** A few cards, each answering "how is
  this going", each linking to the detail behind it.
- **Every number is real.** No sample figures, no chart with made-up weeks, no
  "P 0" that really means "we did not fetch it". If the API cannot answer yet,
  the card is not shown.
- **A card for something the person cannot see is not shown.** Zero cards gives
  one honest empty state that says what to do.
- Public pages have no charts. Staff pages may.

## 6. Page size

Design for the 1366 x 768 office laptop for staff, 390 phone for the public.

| Limit | Value |
|---|---|
| A staff page's main content | about 1 screen; 2 is the ceiling |
| A table page | may be longer: the table is the content |
| Section heading band | 40px or less |
| Empty / error state padding | 24px (32px on large screens) |

If a page needs 5 screens, it is doing several errands: split it using section 4.

## 7. Drill-down patterns

- **A row is a target**: the whole row opens it; the name cell is a real link.
- **A dashboard card links into its detail.**
- **A status chip in a summary filters the table** ("12 Needs your input" opens
  the queue filtered to that status).
- **Every screen offers a next step.** A table that ends the journey is a dead end.
- Clicking a chart bar should filter the table under it when there is a natural
  target. Add it when building a chart, not later.

## 8. Never ship

- A placeholder or "coming soon" page, or a menu entry for something unbuilt.
- A greyed-out menu item for something the person may not use.
- A list endpoint that returns more than the person may see and lets the browser filter.
- A role name, email or user id in a frontend condition.
- Made-up figures on any page people use.
- A section that exists only to explain why it is empty.
- A menu that changes when a client-side "view as" toggle changes. Preview
  toggles change page content, never which routes exist.

## 9. New feature checklist

1. Who is it for? Which capability? Add the capability to the server map if new.
2. Does the API filter to what this person may see? Prove it with a test.
3. Overview, drill-down, tab or page? Apply section 4 in order.
4. If a page: does it earn a menu entry, or is it reached by drilling in?
5. Can the person answer "where am I, what is mine, what next"?
6. Fits one screen at 1366 x 768 (staff) or reads well at 390 (public)?
7. Empty state says what to do. Loading and error are not shown as empty.
8. Lazy route with a boundary (`ceda-routing`).
9. English and Setswana strings.
10. `verify-work` passes.
