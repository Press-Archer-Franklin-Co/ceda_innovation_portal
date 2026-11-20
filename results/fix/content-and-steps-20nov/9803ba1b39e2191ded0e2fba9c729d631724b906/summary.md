## CI results for `fix/content-and-steps-20nov` @ `9803ba1`

Run: https://github.com/Press-Archer-Franklin-Co/ceda_innovation_portal/actions/runs/44737627084
Jobs: admin success, api failure, em-dash success, public success
Overall: **red**
Timing (api job): Run tests 3m 24s, job steps 3m 41s

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass | 0 known on main, 0 new |
| API tests | fail | 575 passed, 2 failed (0 known on main, 2 new) |
| Admin lint | pass | 1 errors, 7 warnings (0 new vs baseline) |
| Admin tests | pass |  |
| Admin build | pass |  |
| Public type check | pass |  |
| Public tests | pass |  |
| Public build | pass |  |

New failures:
- tests/services/test_text_channel_dispatch.py::TextChannelDispatchTests::test_sms_goes_through_configured_sender: AssertionError: CommunicationStatus.SKIPPED != CommunicationStatus.SENT
- tests/services/test_text_channel_dispatch.py::TextChannelDispatchTests::test_whatsapp_and_ussd_without_provider_are_skipped: AssertionError: 'provider' not found in 'Skipped: whatsapp messages are switched off.'

New missing migrations:
- none

New lint problems:
- none

Known failures that now pass:
- none
