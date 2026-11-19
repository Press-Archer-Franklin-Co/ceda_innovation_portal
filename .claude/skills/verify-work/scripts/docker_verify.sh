#!/usr/bin/env bash
# Run the CI checks in throwaway Docker containers (the "docker" route).
#
#   docker_verify.sh [all|api|admin|public] [extra pytest args...]
#
#   docker_verify.sh                     # everything, same checks as CI
#   docker_verify.sh api tests/api/test_x.py::Class::test_y   # one test while fixing (no -n)
#   docker_verify.sh api -n auto tests/api/                    # many tests: add -n yourself
#   docker_verify.sh admin               # only admin lint + build
#
# Uses its own network and containers (ceda-test, ceda-test-db,
# ceda-test-redis). It never starts, stops or changes the production
# docker-compose stack (innovation_portal_*), and never reads .env.production.
# Containers run as the current user so node_modules, dist and reports are not
# owned by root. Results go to test-reports/docker/<branch>-<sha>/ and a
# summary in the same format as CI is printed at the end.
# Exit code: 0 when every check that ran passed, 1 otherwise.
set -uo pipefail

target="${1:-all}"
shift || true
extra_pytest_args=("$@")

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
branch="$(git rev-parse --abbrev-ref HEAD)"
sha="$(git rev-parse HEAD)"
dirty=""
[ -n "$(git status --porcelain -- innovation_portal_api innovation_portal_admin innovation_portal_public scripts)" ] && dirty=" (with uncommitted changes)"
out="$repo/test-reports/docker/${branch//\//_}-${sha:0:7}"
rm -rf "$out"
mkdir -p "$out/api-results" "$out/admin-results" "$out/public-results" "$HOME/.cache/ceda-test-pip" "$HOME/.cache/ceda-test-npm"
uid="$(id -u):$(id -g)"
needs="{}"

add_need() { needs="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d[sys.argv[2]]={"result":sys.argv[3]}; print(json.dumps(d))' "$needs" "$1" "$2")"; }

ensure_services() {
  docker network inspect ceda-test >/dev/null 2>&1 || docker network create ceda-test >/dev/null
  if ! docker inspect -f '{{.State.Running}}' ceda-test-db 2>/dev/null | grep -q true; then
    docker run -d --rm --name ceda-test-db --network ceda-test \
      -e POSTGRES_USER=innovation -e POSTGRES_PASSWORD=innovation -e POSTGRES_DB=innovation_portal \
      postgres:16-alpine >/dev/null
  fi
  if ! docker inspect -f '{{.State.Running}}' ceda-test-redis 2>/dev/null | grep -q true; then
    docker run -d --rm --name ceda-test-redis --network ceda-test redis:7-alpine >/dev/null
  fi
  for _ in $(seq 1 60); do
    docker exec ceda-test-db pg_isready -U innovation -d innovation_portal >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Test database did not become ready" >&2
  return 1
}

run_api() {
  local dir="$out/api-results" install=failure migrations=skipped pytest=skipped results=skipped
  ensure_services || { add_need api failure; return; }
  echo "== api: install, migrations check, pytest"
  # Quote extra args for the inner shell.
  # Full runs use 4-way style parallelism like CI; a targeted re-run is usually a
  # handful of tests, where worker start-up costs more than it saves.
  local args=" -n auto --dist loadfile --durations=15"
  if [ ${#extra_pytest_args[@]} -gt 0 ]; then
    args=""
    for a in "${extra_pytest_args[@]}"; do args+=" $(printf '%q' "$a")"; done
  fi
  docker run --rm --network ceda-test --user "$uid" \
    -v "$repo/innovation_portal_api":/app -v "$dir":/out -v "$HOME/.cache/ceda-test-pip":/tmp/.cache/pip -w /app \
    -e HOME=/tmp -e PIP_USER=1 -e PATH=/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin -e PYTHONDONTWRITEBYTECODE=1 \
    -e DJANGO_SETTINGS_MODULE=config.settings.test \
    -e INNOVATION_PORTAL_POSTGRES_HOST=ceda-test-db -e REDIS_URL=redis://ceda-test-redis:6379/0 \
    python:3.12-slim sh -c "
      pip install -q --disable-pip-version-check -r requirements/local.txt > /out/install.txt 2>&1 || { cat /out/install.txt; exit 10; }
      python manage.py makemigrations --check --dry-run > /out/migrations.txt 2>&1; echo \$? > /out/migrations.code
      pytest -q --create-db -p no:cacheprovider -rf --junitxml=/out/pytest-report.xml${args} 2>&1 | tee /out/pytest-output.txt
    "
  local code=$?
  if [ "$code" -ne 10 ]; then
    install=success
    if python3 scripts/check_migrations.py "$dir/migrations.txt" --exit-code "$(cat "$dir/migrations.code" 2>/dev/null || echo 1)" \
         --known innovation_portal_api/tests/known_migration_drift.txt --summary-json "$dir/migrations-summary.json"; then
      migrations=success; else migrations=failure; fi
    [ "$code" -le 1 ] && pytest=success || pytest=failure
    if [ ${#extra_pytest_args[@]} -gt 0 ]; then
      echo "(partial run: only ${extra_pytest_args[*]})"
    fi
    if python3 scripts/check_test_results.py "$dir/pytest-report.xml" --known innovation_portal_api/tests/known_failures.txt \
         --root innovation_portal_api --summary-json "$dir/api-tests.json" --details "$dir/api-new-failures.txt"; then
      results=success
    else
      results=failure
    fi
    # A partial run cannot see the known failures, so only "new failures" matter there.
    if [ ${#extra_pytest_args[@]} -gt 0 ] && python3 -c 'import json,sys; sys.exit(0 if not json.load(open(sys.argv[1]))["new_failures"] else 1)' "$dir/api-tests.json" 2>/dev/null; then
      results=success
    fi
  fi
  printf '{"install": "%s", "migrations": "%s", "pytest": "%s", "results": "%s"}\n' "$install" "$migrations" "$pytest" "$results" > "$dir/api-steps.json"
  if [ "$install" = success ] && [ "$migrations" = success ] && [ "$results" = success ]; then add_need api success; else add_need api failure; fi
}

node_run() {  # app dir, command
  docker run --rm --user "$uid" -v "$repo/$1":/app -v "$out":/out -v "$HOME/.cache/ceda-test-npm":/tmp/.npm -w /app \
    -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e npm_config_update_notifier=false node:22 sh -c "$2"
}

run_admin() {
  local dir="$out/admin-results" install=failure lint=skipped test=skipped build=skipped
  echo "== admin: npm ci, lint vs baseline, tests, build"
  if node_run innovation_portal_admin "npm ci --no-audit --no-fund > /out/admin-results/install.txt 2>&1 || { cat /out/admin-results/install.txt; exit 1; }"; then
    install=success
    node_run innovation_portal_admin "npm run lint -- --format json --output-file /out/admin-results/admin-lint.json >/dev/null 2>&1; npx eslint . --ext js,jsx --report-unused-disable-directives > /out/admin-results/admin-lint.txt 2>&1; true"
    if (cd innovation_portal_admin && python3 ../scripts/check_lint_baseline.py "$dir/admin-lint.json" --baseline lint-baseline.json \
          --root /app --summary-json "$dir/admin-lint-summary.json"); then lint=success; else lint=failure; fi
    if node_run innovation_portal_admin "npm test > /out/admin-results/admin-test.txt 2>&1 || { tail -50 /out/admin-results/admin-test.txt; exit 1; }"; then test=success; else test=failure; fi
    if node_run innovation_portal_admin "npm run build > /out/admin-results/admin-build.txt 2>&1 || { tail -50 /out/admin-results/admin-build.txt; exit 1; }"; then build=success; else build=failure; fi
  fi
  printf '{"install": "%s", "lint": "%s", "test": "%s", "build": "%s"}\n' "$install" "$lint" "$test" "$build" > "$dir/admin-steps.json"
  if [ "$install$lint$test$build" = successsuccesssuccesssuccess ]; then add_need admin success; else add_need admin failure; fi
}

run_public() {
  local dir="$out/public-results" install=failure typecheck=skipped test=skipped build=skipped
  echo "== public: npm ci, tsc --noEmit, tests, build"
  if node_run innovation_portal_public "npm ci --no-audit --no-fund > /out/public-results/install.txt 2>&1 || { cat /out/public-results/install.txt; exit 1; }"; then
    install=success
    if node_run innovation_portal_public "npx tsc --noEmit > /out/public-results/public-typecheck.txt 2>&1 || { cat /out/public-results/public-typecheck.txt; exit 1; }"; then typecheck=success; else typecheck=failure; fi
    if node_run innovation_portal_public "npm test > /out/public-results/public-test.txt 2>&1 || { tail -50 /out/public-results/public-test.txt; exit 1; }"; then test=success; else test=failure; fi
    if node_run innovation_portal_public "npm run build > /out/public-results/public-build.txt 2>&1 || { tail -50 /out/public-results/public-build.txt; exit 1; }"; then build=success; else build=failure; fi
  fi
  printf '{"install": "%s", "typecheck": "%s", "test": "%s", "build": "%s"}\n' "$install" "$typecheck" "$test" "$build" > "$dir/public-steps.json"
  if [ "$install$typecheck$test$build" = successsuccesssuccesssuccess ]; then add_need public success; else add_need public failure; fi
}

case "$target" in
  all) run_api; run_admin; run_public ;;
  api) run_api ;;
  admin) run_admin ;;
  public) run_public ;;
  *) echo "usage: $0 [all|api|admin|public] [pytest args...]" >&2; exit 2 ;;
esac

# ci_report.py expects the lint root inside the container (/app) to have been used, which it was.
python3 scripts/ci_report.py --reports "$out" --out "$out/summary" --branch "$branch" --sha "$sha" \
  --run-url "docker (local containers)${dirty}" --needs "$needs" > /dev/null
cat "$out/summary/summary.md"
echo "Files saved in ${out#"$repo"/}/"
grep -q '"green": true' "$out/summary/summary.json"
