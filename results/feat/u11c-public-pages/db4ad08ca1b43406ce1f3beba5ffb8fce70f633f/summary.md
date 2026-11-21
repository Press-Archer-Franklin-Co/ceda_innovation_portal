## CI results for `feat/u11c-public-pages` @ `db4ad08`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44956428769
Jobs: admin success, api success, em-dash success, old-ui failure, public success
Overall: **red**
Timing (api job): Run tests 4m 37s, job steps 4m 59s

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 0 known on main, 0 new |
| API tests | pass | 730 passed, 0 failed (0 known on main, 0 new) |
| Admin lint | pass | 0 errors, 5 warnings (0 new vs baseline) |
| Admin tests | pass |  |
| Admin build | pass |  |
| Public type check | pass |  |
| Public tests | pass |  |
| Public build | pass |  |
| Old-UI guard | fail | scripts/check_old_ui.mjs |

New failures:
- none

New missing migrations:
- none

New lint problems:
- none

Known failures that now pass:
- none
