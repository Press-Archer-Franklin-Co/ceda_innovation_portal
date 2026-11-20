## CI results for `feat/capabilities` @ `094bd62`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44705882888
Jobs: admin failure, api success, em-dash failure, public success
Overall: **red**
Timing (api job): Run tests 3m 29s, job steps 3m 47s

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 0 known on main, 0 new |
| API tests | pass | 543 passed, 24 failed (24 known on main, 0 new) |
| Admin lint | fail | 1 errors, 8 warnings (1 new vs baseline) |
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
- warning src/pages/assignments/AssignmentDetail.jsx:173 react-hooks/exhaustive-deps: The 'groupedDocuments' logical expression could make the dependencies of useMemo Hook (at line 221) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'groupedDocuments' in its own useMemo() Hook.

Known failures that now pass:
- none
