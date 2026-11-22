## CI results for `feat/u11a-staff-programmes` @ `5edfde5`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44983758594
Jobs: admin failure, api success, em-dash success, old-ui success, public success
Overall: **red**
Timing (api job): Run tests 4m 05s, job steps 4m 24s

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 0 known on main, 0 new |
| API tests | pass | 714 passed, 0 failed (0 known on main, 0 new) |
| Admin lint | fail | 0 errors, 5 warnings (1 new vs baseline) |
| Admin tests | pass |  |
| Admin build | pass |  |
| Public type check | pass |  |
| Public tests | pass |  |
| Public build | pass |  |
| Old-UI guard | pass | scripts/check_old_ui.mjs |

New failures:
- none

New missing migrations:
- none

New lint problems:
- warning src/components/challenges/EligibilityRules.jsx:46 react-refresh/only-export-components: Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.

Known failures that now pass:
- none
