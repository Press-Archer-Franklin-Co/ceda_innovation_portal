## CI results for `feat/u11a-staff-programmes` @ `ae054df`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44984220705
Jobs: admin failure, api success, em-dash success, old-ui success, public success
Overall: **red**
Timing (api job): Run tests 3m 58s, job steps 4m 16s

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 0 known on main, 0 new |
| API tests | pass | 714 passed, 0 failed (0 known on main, 0 new) |
| Admin lint | fail | 0 errors, 6 warnings (2 new vs baseline) |
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
- warning src/components/workflow/StepExtras.jsx:25 react-refresh/only-export-components: Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.

Known failures that now pass:
- none
