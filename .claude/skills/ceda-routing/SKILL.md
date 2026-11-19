---
name: ceda-routing
description: "Read before adding or changing any route, layout, menu link, redirect, route guard or loading/error boundary in innovation_portal_admin or innovation_portal_public, and before looking into 'the page feels slow' or 'the click did nothing'. Defines code splitting per route, the loading-boundary rule, guards, prefetching and the checks to run."
---

# CEDA routing and loading

Both frontends use **React Router 6 with Vite**, all data fetched in the
browser. The admin console is served under `/staff` (`BrowserRouter basename="/staff"`).

The goal: **a click always changes the screen within 100ms**, even if the data
takes longer. A click that leaves the old page frozen reads as "nothing
happened", and people click again.

## 1. Split every page, and give every split a boundary

Today `innovation_portal_admin/src/App.jsx` imports every page at the top of
the file, so the first visit downloads the whole console (Chart.js included)
before the dashboard can draw. Fix and keep fixed:

- **Every page is `React.lazy(() => import('./pages/...'))`.** The shell
  (`AppLayout`, sidebar, top bar) stays eager.
- **Every lazy page sits under a `<Suspense>` boundary whose fallback looks like
  that page.** Put one boundary inside `AppLayout` around `<Outlet/>` so every
  route is covered the day it is created, and the sidebar and top bar never
  disappear during a page load.
- Use the page skeletons in `components/ui/PageSkeleton`: `ListPageSkeleton`,
  `DetailPageSkeleton`, `StatsPageSkeleton`, `FormPageSkeleton`. Pick per route
  group only when the generic list shape is wrong for that page.
- A skeleton reserves the real heights. A mismatched skeleton swaps a frozen
  screen for a jumping one.
- Keep the existing `ErrorBoundary`, but make its fallback the shared
  `ErrorState` ("This page could not load. Try again.") with a Retry that resets
  the boundary, and **never print the stack trace to the person**. Log it to
  the console in development only.
- A lazy chunk can fail after a deploy (the old file is gone). Catch that error
  in the boundary and offer "Reload to get the latest version".

Do the same in `innovation_portal_public/src/App.tsx`: lazy pages, one
`<Suspense>` inside the public layout, skeletons for home, list and detail.

## 2. Heavy libraries load only where they are used

- **Chart.js** is only for staff dashboard, reports and analytics. Import it
  from one module, `src/components/charts/lazy.js`, which loads it with
  `React.lazy`. Never import `chart.js` straight into a page or a shared component.
- A small helper (a legend, a number formatter) must not live in the chart
  module, or everything that uses the helper pulls in Chart.js too.
- Same idea for the form builder's drag and drop, the rich text editor and the
  image cropper: load them on the route that uses them.

**Check it in the build** (section 6), not by reading code. Reviews miss it.

## 3. Prefetch what the person is about to open

- Menu links: on `pointerenter` (desktop) or `touchstart`, call the route's
  `import()` so its code is warm. A tiny `prefetchRoute(path)` helper, keyed by
  the same map the router uses.
- Data: for a detail page or a dialog, `queryClient.prefetchQuery` with the same
  key the page uses, on hover or press.
- **Do not** prefetch every row of a long table on scroll. A list of 200 entries
  prefetching 200 detail pages makes the real click slower. Prefetch on hover only.
- A route reached with `navigate()` from code (a row click, after saving) is
  never prefetched by a link, so it **must** have a boundary.

## 4. Guards

```
ProtectedRoute   who are you?          (signed in, has any staff role)
Permission guard what may you do here? (asks a capability, never a role name)
```

- Guards are courtesy. The API refuses on its own (see `ceda-security`). A guard
  exists so the person does not see a page that will only fail.
- While we do not yet know who the person is, show the CEDA mark loader, not the
  page and not a "forbidden" flash.
- A route the person may not open shows the shared not-allowed state with who to
  ask, inside the shell. It does not redirect to the public site without saying why.
- One place lists the staff menu: `src/layout/nav.js`. Each entry names its path
  and the capability it needs. The sidebar, the guard and the breadcrumbs all
  read that one list. A test fails if a menu entry has no route.

## 5. Navigation rules

- `<Link>` for anything a person sees as a place to go.
- `navigate()` only for flows: after save, a row click, search results.
- **Never** `window.location` for a page inside the same app; it throws away the
  query cache and reloads everything. The one exception is crossing between the
  public site and `/staff` (two different apps), which `ProtectedRoute` does today.
- Do not read `useSearchParams()` in the layout or the shell. Every query string
  change would re-render the whole sidebar. Read it in the page.
- The page title (browser tab) is set per route: "Review queue · CEDA Innovation".
- A route change scrolls to the top, except when going back.
- A short fade on the page content (150ms opacity on the `<Outlet/>` wrapper) is
  fine. Never remount the whole page just to animate it.

## 6. Checks before you say a routing change is good

1. **Every page is lazy and covered.** `grep -n "^import .* from './pages" src/App.jsx` returns nothing.
2. **The first load is small.** `npm run build` and read Vite's output: the main
   chunk should not contain Chart.js. A quick test:
   `grep -l "Chart.register\|chart.js" dist/assets/index-*.js` returns nothing.
3. **Measure on a production build**, never on `npm run dev`. Vite's dev server
   serves modules one by one and every timing you take there is meaningless.
   Use `npm run build && npm run preview`.
4. **Targets**: click to visible change under 100ms; moving between two menu
   pages already visited under 200ms; no full page reload for an internal link.
5. The `verify-work` skill passes (lint and build for both apps).

## 7. New route checklist

1. Lazy import, inside the shell's `<Suspense>`.
2. Skeleton fits the page (or the generic one does).
3. Entry in `nav.js` with its capability, if it belongs in the menu.
4. Permission guard via capability, not role name.
5. Query keys from `src/lib/queries/keys.js`, nested under their parent.
6. Charts and other heavy parts loaded lazily.
7. Browser tab title set.
8. Works at 1440 and 390.
