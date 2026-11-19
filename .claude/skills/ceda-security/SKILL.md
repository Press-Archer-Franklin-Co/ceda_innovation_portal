---
name: ceda-security
description: "Read before adding or changing any permission check, role, route guard, API client, audit log entry or alert in the CEDA Innovation Portal (Django API, staff console, public site), and before looking into an unexplained 401 or 403. Defines where permissions are decided, why the browser never asks for what it cannot have, what a refusal must record, and how to keep the frontend and API lists in step."
---

# CEDA security and authorization

## 1. The server decides. The browser only declines to ask.

```
API (Django)   decides every time, from the signed-in user. Refuses on its own.
Frontends      hide what the person cannot use, so they never ask for it.
               Deleting a frontend check must not let anybody reach anything.
```

- Every endpoint has a permission class from `apps/core/permissions.py`
  (`HasRolePermission` and its subclasses, `IsOwnerOrOfficerOrAdmin`, and so on).
  Never decide access inside a view body with an `if`.
- Object access (my idea, not yours) is checked with `has_object_permission`
  **and** by filtering the queryset to what this user may see. A list endpoint
  that filters only in the serializer leaks counts and ids.
- Never trust anything the caller sends to decide access: not a header, not a
  query parameter, not a `role` field in the body, not an id in the URL without
  checking it belongs to them.
- Public endpoints (`AllowAny`) use the existing throttles and never return
  internal notes, reviewer names, scores before release, or unpublished content.

## 2. Ask for a capability, not a role

Today both sides reason about **role names**, and the two lists have already
drifted. Example found on 19 Nov 2026:

- Admin `src/lib/auth/permissions.js` lets `innovation_manager`,
  `innovation_analyst`, `staff_member`, `specialist`, `exo` and
  `management_viewer` through `OfficerRoute`, so they see **Website content**.
- The API's `IsOfficerOrAdmin` only allows `innovation_officer` and
  `administrator`. Those people open the page and every save is refused.
- `isAdminOrManager` in the frontend does not include `innovation_manager` at all.

The fix, and the rule from now on:

1. The API owns a **capability map**: `apps/core/capabilities.py`, one dict from
   capability (`content.edit`, `challenges.manage`, `entries.review`,
   `users.manage`, `analytics.view`, `settings.manage`, ...) to the roles that
   hold it. Permission classes read this map (`HasCapability('content.edit')`).
- `GET /api/auth/me/` returns `capabilities: string[]` for the signed-in user.
- The frontends ask `can('content.edit')` from the auth context. **No component
  checks a role name, an email or a user id.** `is_superuser` is handled once, on
  the server, by giving superusers every capability.
- Menu entries, tabs, row actions and route guards all use `can(...)`.

## 3. Keep the two sides pinned with a test

Two hand-kept lists always drift. So:

- An API test walks every URL pattern and asserts each view has a permission
  class (no view left on the default by accident), and that every capability used
  by a view exists in the map.
- A frontend check (`scripts/check-capabilities.mjs`, run in CI) reads
  `apps/core/capabilities.py`, then asserts **both directions**: every capability
  the frontend asks for exists on the server, and the frontend does not hide
  something the server would allow. The second direction matters most: if the
  browser wrongly hides a feature, there is no request, so nothing on the server
  shows the bug.

## 4. Do not ask for what will be refused

A refused request costs a round trip, fills the logs, and hides real problems.

- Gate requests **once**, in the API client (`src/lib/api.js` admin,
  `src/services/api.ts` public), using the same capability list. Not per page.
- A dashboard card whose endpoint needs `analytics.view` is not rendered, and its
  query has `enabled: can('analytics.view')`, for people without it.
- **Polling stops on 401 and 403.** `refetchInterval` keeps firing on a failing
  query for ever. Return `false` from the interval when the last error was 401/403.
- Until `me` has answered, do not block requests (the server will decide).
- **On sign-out, clear** the capability list and the whole query cache, so the
  next person on a shared office computer never sees the previous person's data
  or permissions.

## 5. What a refusal records

When the API refuses (401, 403, throttled), record enough to know who and why,
and nothing that would itself be a leak:

| Record | Why |
|---|---|
| Route **pattern** (`/api/programs/<id>/`), not the full URL | ids would make every request its own row; query strings can carry phone numbers and emails |
| Method, status, error code | the refusal itself |
| User id (or anonymous) | who |
| Client address and user agent | where from; group by these |
| Client build (`X-CEDA-Client: admin@<git sha>` or `public@<sha>`) | tells "our own UI asked wrongly" from "not our UI" |
| Correlation id | to find the matching log line |

- **Group repeats with a counter.** One row with a climbing count, not a
  thousand rows.
- **Write one audit log line per refusal** to a logger named
  `security.authorization`, through the existing `apps/audit` style. The table is
  for spotting patterns; the log is the record. Both are needed.
- **Never log**: passwords, tokens, cookies, OTP codes, request bodies, query
  strings, national ID numbers, phone numbers.
- Check the logger actually has a handler in `config/settings`. A logger with no
  handler drops everything silently.
- **None of these values decide access.** The address and headers come from the
  caller and can be faked. They are for spotting, never for allowing.

## 6. Alerts people will not switch off

Once the UI never asks for what it cannot have, a refusal on a gated route
means one of three things. The build header tells them apart:

| `X-CEDA-Client` | Means | What happens |
|---|---|---|
| Missing | not our UI: a script or a copied request | security alert to the admin |
| Older build | a tab left open from before a release | counted, shown, no alert |
| Current build | our own bug | goes to the developers, not as an attack |

- Celery tasks or management commands that call the API identify themselves too
  (`X-CEDA-Client: worker@<sha>`), and act with only the permissions of the
  account they run as.
- Thresholds and time windows live in settings (Platform settings, B1b), never
  hard-coded.
- The alert says what was reached: usually **nothing**, because the permission
  check answered first. An alert that reads like a breach when nothing happened
  teaches people to ignore alerts.

## 7. Sign-in specifics for CEDA

- Phone codes (OTP): short expiry, limited attempts, throttled per number and per
  address, never logged, never returned in an API response outside tests.
- CEDA staff SSO: the identity provider says who you are; **the portal's own
  roles** say what you may do. Never grant a capability from an SSO group name
  without mapping it in the capability map.
- Staff sessions time out after inactivity (value in Platform settings).

## 8. Checklist

- [ ] The API refuses on its own, and a test proves it (permission denied case).
- [ ] The frontend check is a courtesy; removing it weakens nothing.
- [ ] No role name, email or user id in any frontend condition. Uses `can(...)`.
- [ ] Capability map and frontend pinned by a test, both directions.
- [ ] Polling stops on 401/403; sign-out clears capabilities and cache.
- [ ] Refusals record route pattern, user, address, agent, client build; repeats grouped.
- [ ] One audit line per refusal, with no secrets and no query strings.
- [ ] Nothing the caller sends is used to decide access.
