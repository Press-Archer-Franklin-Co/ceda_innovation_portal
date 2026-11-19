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
| Migrations up to date | `python manage.py makemigrations --check --dry-run > mig.txt 2>&1; python ../scripts/check_migrations.py mig.txt --exit-code $? --known tests/known_migration_drift.txt` (innovation_portal_api) |
| API tests | `pytest -q -n auto --dist loadfile --create-db -p no:cacheprovider --junitxml=pytest-report.xml -rf --durations=15`, then `python ../scripts/check_test_results.py pytest-report.xml --known tests/known_failures.txt --root .` |
| Admin lint | `npm run lint -- --format json --output-file lint.json`, then `python3 ../scripts/check_lint_baseline.py lint.json --baseline lint-baseline.json --root .` |
| Admin tests | `npm test` (innovation_portal_admin, Vitest) |
| Admin build | `npm run build` (innovation_portal_admin) |
| Public type check | `npx tsc --noEmit` (innovation_portal_public) |
| Public tests | `npm test` (innovation_portal_public, Vitest) |
| Public build | `npm run build` (innovation_portal_public) |

Tests use `config.settings.test` (fast password hasher, in-memory email); `pytest.ini` sets it, and `config.settings.local` stays for running the server. The migrations check, API tests and admin lint pass when there is nothing **new** compared with `main`: main has model changes without migrations (`innovation_portal_api/tests/known_migration_drift.txt`), 24 tests already fail on main (`innovation_portal_api/tests/known_failures.txt`), and admin lint has a baseline (`innovation_portal_admin/lint-baseline.json`). The checker scripts decide; do not judge by pytest's or ESLint's exit code.

## 1. Check what can run here

Run these and note the results:

```bash
python3 --version                      # need 3.12+
command -v psql && pg_isready          # PostgreSQL reachable?
command -v redis-server; redis-cli ping
node --version                         # need v22
docker ps >/dev/null                   # Docker usable without sudo?
command -v gh && gh auth status
```

## 2. Pick the first route that works, and say which one you used

### Local
When Python 3.12+, a reachable PostgreSQL and Redis exist:

```bash
cd innovation_portal_api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements/local.txt
export DJANGO_SETTINGS_MODULE=config.settings.test REDIS_URL=redis://localhost:6379/0
# plus INNOVATION_PORTAL_POSTGRES_{USER,PASSWORD,DB,HOST,PORT} if not innovation/innovation/innovation_portal on localhost:5432
python manage.py makemigrations --check --dry-run > mig.txt 2>&1; python ../scripts/check_migrations.py mig.txt --exit-code $? --known tests/known_migration_drift.txt
pytest -q -n auto --dist loadfile --create-db -p no:cacheprovider --junitxml=pytest-report.xml -rf --durations=15
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
When `docker ps` works (no sudo needed; if it says permission denied, the session needs restarting after the user was added to the `docker` group), run everything in **throwaway containers**. **Never start, stop, rebuild or exec into the production docker-compose stack** (`innovation_portal_*` containers, `innovation_portal_net`), and never read `.env.production`.

One command runs the same checks as CI and prints the summary:

```bash
.claude/skills/verify-work/scripts/docker_verify.sh            # all: api, admin, public
.claude/skills/verify-work/scripts/docker_verify.sh api tests/api/test_x.py::Class::test_y   # while fixing
.claude/skills/verify-work/scripts/docker_verify.sh admin      # or public
```

Results land in `test-reports/docker/<branch>-<sha>/` (`summary/summary.md`, `api-results/api-new-failures.txt` with full tracebacks, lint and build logs). A full API run takes several minutes, so run it in the background and wait for it to finish.

What the script does, so you can run the steps by hand if needed:

```bash
docker network create ceda-test 2>/dev/null
docker run -d --rm --name ceda-test-db --network ceda-test -e POSTGRES_USER=innovation -e POSTGRES_PASSWORD=innovation -e POSTGRES_DB=innovation_portal postgres:16-alpine
docker run -d --rm --name ceda-test-redis --network ceda-test redis:7-alpine

# API tests
docker run --rm --network ceda-test -v "$PWD/innovation_portal_api":/app -w /app \
  -e DJANGO_SETTINGS_MODULE=config.settings.test \
  -e INNOVATION_PORTAL_POSTGRES_HOST=ceda-test-db -e REDIS_URL=redis://ceda-test-redis:6379/0 \
  python:3.12-slim sh -c "pip install -q -r requirements/local.txt && pytest -q -n auto --dist loadfile --create-db -p no:cacheprovider -rf"

# Frontends
docker run --rm -v "$PWD/innovation_portal_admin":/app -w /app node:22 sh -c "npm ci && npm run lint && npm run build"
docker run --rm -v "$PWD/innovation_portal_public":/app -w /app node:22 sh -c "npm ci && npx tsc --noEmit && npm run build"
```

On top of those commands, the script:
- runs as your user (`--user`, `HOME=/tmp`, `pip --user`), so `node_modules`, `dist` and the reports are not owned by root;
- keeps pip and npm caches in `~/.cache/ceda-test-*`;
- adds `--junitxml`, the migrations check, and the three checker scripts, because plain `npm run lint` and `pytest` exit non-zero on `main`'s known problems.

`ceda-test-db` and `ceda-test-redis` can stay running between runs (`--create-db` gives each run a fresh test database). Stop them when you're done: `docker stop ceda-test-db ceda-test-redis`.

The Docker route covers the PR gate. Pushing still runs CI, and the PR description links that run too.

### CI (GitHub Actions)
Otherwise: commit to the feature branch, push, and wait for the Actions run for **that exact commit**.

```bash
git push origin <branch>
sha=$(git rev-parse HEAD)
```

Then read the result, using the first option that works:
1. `gh` installed and signed in:
   `gh run list --branch <branch> --commit $sha`, `gh run watch <run-id> --exit-status`, `gh run view <run-id> --log-failed`.
   Ignore runs whose conclusion is `cancelled` (CI cancels a run when a newer one starts for the same branch, including the duplicate `push`/`pull_request` pair) and watch the newest run for the commit.
2. A GitHub API token in the environment (`GH_TOKEN` or `GITHUB_TOKEN`):
   `curl -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/{owner}/{repo}/actions/runs?head_sha=$sha"`, then the run's jobs and logs.
3. Plain git access only (SSH remote, no token; the usual case for this repo):
   `.claude/skills/verify-work/scripts/wait_for_ci.sh <branch> $sha` (run it in the background; it polls every 30 s, up to 45 min).
   The CI `report` job publishes each pushed commit's results to the `ci-results` branch at `results/<branch>/<sha>/`: `summary.md`, `summary.json`, `api-new-failures.txt` (full tracebacks of new failures), `migrations.txt`, `admin-lint.json`, and the tail of any failed step's log. The script copies them to `test-reports/ci/`.

Never open the PR until this run is green. Never merge `ci-results` into anything.

## 3. While fixing, run only what changed

After a failure, re-run just the failing tests or step until it passes (for example `pytest tests/api/test_x.py::Class::test_name`, or only the admin build). For fewer than about 20 tests, drop `-n auto`: starting the workers costs more than it saves. On the CI route every push re-runs everything, so batch fixes into one push. When everything is fixed, run the full set once more and report on that final run.

## 4. Never

- skip, delete, mark `xfail`/`skip`, or weaken a test (looser assertions, broader expected status codes) to get green;
- add a test to `tests/known_failures.txt`, a line to `tests/known_migration_drift.txt`, or a problem to `lint-baseline.json` to hide a new failure (a model change needs its migration). These files only shrink, except when `main` itself changes and the baseline is regenerated from `main`;
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
