## CI results for `chore/verify-work` @ `1e1a8ec`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44521767609
Jobs: admin success, api failure, public success
Overall: **red**

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 11 known on main, 0 new |
| API tests | fail | 271 passed, 25 failed (24 known on main, 1 new) |
| Admin lint | pass | 1 errors, 9 warnings (0 new vs baseline) |
| Admin build | pass |  |
| Public type check | pass |  |
| Public build | pass |  |

New failures:
- tests/services/test_ci_gate_probe.py::CIGateProbeTests::test_deliberately_fails: AssertionError: 1 != 2 : deliberate failure to prove the CI gate

New missing migrations:
- none

New lint problems:
- none

Known failures that now pass:
- none
