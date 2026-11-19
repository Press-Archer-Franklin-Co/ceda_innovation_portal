## CI results for `feat/ui-system-genie` @ `9cf98a5`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44616818512
Jobs: admin failure, api success, em-dash success, public success
Overall: **red**
Timing (api job): Run tests 2m 57s, job steps 3m 12s

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 11 known on main, 0 new |
| API tests | pass | 471 passed, 24 failed (24 known on main, 0 new) |
| Admin lint | fail | 1 errors, 9 warnings (1 new vs baseline) |
| Admin tests | pass |  |
| Admin build | pass |  |
| Public type check | pass |  |
| Public tests | pass |  |
| Public build | pass |  |

New failures:
- none

New missing migrations:
- none

New lint problems:
- warning src/pages/analytics/Analytics.jsx:422 react-hooks/exhaustive-deps: The 'programs' conditional could make the dependencies of useEffect Hook (at line 438) change on every render. To fix this, wrap the initialization of 'programs' in its own useMemo() Hook.

Known failures that now pass:
- none
