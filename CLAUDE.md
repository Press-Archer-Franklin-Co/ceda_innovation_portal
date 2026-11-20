# CEDA Innovation Portal: notes for agents

Three apps: `innovation_portal_api` (Django + DRF), `innovation_portal_public` (public and innovator site, React 18 + TypeScript) and `innovation_portal_admin` (staff console under /staff, React 19).

Skills live in `.claude/skills/`. Read the one that fits before you start:

- Any frontend component, screen, table, tab, modal, form or state: read `ceda-ui`.
- Any modal, popover, dropdown menu or toast: read `ceda-genie-motion`.
- Any route, layout, guard, or "it feels slow" problem: read `ceda-routing`.
- Any permission, guard, API client, audit or alert change: read `ceda-security`.
- Any page, menu item, tab, dashboard card or report: read `ceda-user-scope`.
- Any text at all (UI strings, errors, comments, commits, docs): read `plain-writing`.
- Before you say work is done: run `verify-work` and paste its report.

House rules in short:

- Reuse the shared components in `src/components/ui/` of each app. Each app has a `/styleguide` page in dev builds that shows them all.
- Colours, type and radii come from the Option D tokens (`src/styles/tokens.css`, `tailwind.tokens.js`), never hand-typed hex.
- Every UI string goes through `src/i18n` with an English and a Setswana entry.
- Never show made-up numbers or raw API values. Loading and errors are not "empty".
- No em dashes anywhere. CI checks new lines (`scripts/check_em_dash.sh`).
- One task, one branch, one pull request.
