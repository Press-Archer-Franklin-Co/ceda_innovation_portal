---
name: verify-work
description: Test and verify changes in the CEDA Innovation Portal repo (API tests, migrations check, admin lint and build, public type check and build) and write the standard test report. Use it EVERY time before reporting work as done, before opening a pull request, and whenever the user asks to test, verify, check or run the tests. Runs locally, in Docker, or through GitHub Actions when nothing can run on this machine.
---

# Verify work

Nothing is "done" until this skill has run and its report says so. Use it:
- before saying a change is finished,
- before opening a pull request (never open one unless the report says `Ready for PR: yes`),
- whenever the user asks to test, verify or check something.

The checks are the same everywhere, and match `.github/workflows/ci.yml`:

| Check | Command (from the app folder) |
| --- | --- |
| Migrations up to date | `python manage.py makemigrations --check --dry-run` (innovation_portal_api) |
| API tests | `pytest -q --create-db -p no:cacheprovider --junitxml=pytest-report.xml -rf`, then `python ../scripts/check_test_results.py pytest-report.xml --known tests/known_failures.txt --root .` |
| Admin lint | `npm run lint -- --format json --output-file lint.json`, then `python3 ../scripts/check_lint_baseline.py lint.json --baseline lint-baseline.json --root .` |
| Admin build | `npm run build` (innovation_portal_admin) |
| Public type check | `npx tsc --noEmit` (innovation_portal_public) |
| Public build | `npm run build` (innovation_portal_public) |

The API tests and admin lint pass when there is nothing **new** compared with `main`: 24 tests already fail on main (`innovation_portal_api/tests/known_failures.txt`) and admin lint has a baseline (`innovation_portal_admin/lint-baseline.json`). The checker scripts decide; do not judge by pytest's or ESLint's exit code.

## 1. Check what can run here

Run these and note the results:

```bash
python3 --version                      # need 3.12+
command -v psql && pg_isready          # PostgreSQL reachable?
command -v redis-server; redis-cli ping
node --version                         # need v22
docker compose version && docker info >/dev/null
command -v gh && gh auth status
```

## 2. Pick the first route that works, and say which one you used

### Local
When Python 3.12+, a reachable PostgreSQL and Redis exist:

```bash
cd innovation_portal_api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements/local.txt
export DJANGO_SETTINGS_MODULE=config.settings.local REDIS_URL=redis://localhost:6379/0
# plus INNOVATION_PORTAL_POSTGRES_{USER,PASSWORD,DB,HOST,PORT} if not innovation/innovation/innovation_portal on localhost:5432
python manage.py makemigrations --check --dry-run
pytest -q --create-db -p no:cacheprovider --junitxml=pytest-report.xml -rf
python ../scripts/check_test_results.py pytest-report.xml --known tests/known_failures.txt --root .
```

When Node 22 exists:

```bash
cd innovation_portal_admin && npm ci && npm run lint -- --format json --output-file lint.json; \
  python3 ../scripts/check_lint_baseline.py lint.json --baseline lint-baseline.json --root . && npm run build
cd innovation_portal_public && npm ci && npx tsc --noEmit && npm run build
```

If Node is missing but the API ran locally, the frontend checks still have to come from CI (push and use the CI route for them).

### Docker
When `docker compose` works, run the API checks in the existing compose services (database and Redis from `docker-compose.yml`, code from the backend image):

```bash
docker compose up -d innovation_portal_db innovation_portal_redis
docker compose run --rm -e DJANGO_SETTINGS_MODULE=config.settings.local innovation_portal_backend \
  sh -c "pip install -r requirements/local.txt && python manage.py makemigrations --check --dry-run && \
         pytest -q --create-db -p no:cacheprovider --junitxml=pytest-report.xml -rf"
```

Then run `check_test_results.py` on the report as above. The compose file reads `.env.production`; never print or commit its contents.

### CI (GitHub Actions)
Otherwise: commit to the feature branch, push, and wait for the Actions run for **that exact commit**.

```bash
git push origin <branch>
sha=$(git rev-parse HEAD)
```

Then read the result, using the first option that works:
1. `gh` installed and signed in:
   `gh run list --branch <branch> --commit $sha`, `gh run watch <run-id> --exit-status`, `gh run view <run-id> --log-failed`.
2. A GitHub API token in the environment (`GH_TOKEN` or `GITHUB_TOKEN`):
   `curl -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/{owner}/{repo}/actions/runs?head_sha=$sha"`, then the run's jobs and logs.
3. Plain git access only (SSH remote, no token; the usual case for this repo):
   `.claude/skills/verify-work/scripts/wait_for_ci.sh <branch> $sha` (run it in the background; it polls every 30 s, up to 45 min).
   The CI `report` job publishes each pushed commit's results to the `ci-results` branch at `results/<branch>/<sha>/`: `summary.md`, `summary.json`, `api-new-failures.txt` (full tracebacks of new failures), `migrations.txt`, `admin-lint.json`, and the tail of any failed step's log. The script copies them to `test-reports/ci/`.

Never open the PR until this run is green. Never merge `ci-results` into anything.

## 3. While fixing, run only what changed

After a failure, re-run just the failing tests or step until it passes (for example `pytest tests/api/test_x.py::Class::test_name`, or only the admin build). On the CI route every push re-runs everything, so batch fixes into one push. When everything is fixed, run the full set once more and report on that final run.

## 4. Never

- skip, delete, mark `xfail`/`skip`, or weaken a test (looser assertions, broader expected status codes) to get green;
- add a test to `tests/known_failures.txt` or a problem to `lint-baseline.json` to hide a new failure. These files only shrink, except when `main` itself changes and the baseline is regenerated from `main`;
- report work as done, or open a PR, without a report from the current commit.

If a failure is truly unrelated to the change (it fails on `main` too and is not in the list), say so in the report with the evidence, and ask the user what to do.

## 5. Write the report

Write it to `test-reports/<branch with / replaced by _>-<short sha>.md` (ignored by git) and paste the whole report in the reply to the user, in exactly this format:

```
## Test report
Branch: <branch>   Commit: <short sha>   Date: <YYYY-MM-DD HH:MM, Africa/Gaborone>
Route: local | docker | ci (<link to the Actions run>)

| Check | Result | Details |
| --- | --- | --- |
| Migrations up to date | pass/fail | |
| API tests | pass/fail | <passed> passed, <failed> failed (<known> known on main, <new> new) |
| Admin lint | pass/fail | <errors> errors, <warnings> warnings (<new> new vs baseline) |
| Admin build | pass/fail | |
| Public type check | pass/fail | |
| Public build | pass/fail | |

New failures (must be zero to open a PR):
- <test id>: <one-line reason>

Known failures that now pass (can be removed from known_failures.txt):
- <test id>

Tests added in this change:
- <file>: <what it covers>

Ready for PR: yes | no (<why>)
```

Notes:
- Get the date with `TZ=Africa/Gaborone date '+%Y-%m-%d %H:%M'`.
- Write `- none` under a heading that has no items.
- A check that could not run is `fail` with the reason in Details, never `pass`.
- `Ready for PR: yes` only when every row is `pass`, there are no new failures, and the report is for the commit you are about to open the PR from.
