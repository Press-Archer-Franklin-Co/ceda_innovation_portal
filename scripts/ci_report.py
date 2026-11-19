#!/usr/bin/env python3
"""Combine the CI job outputs into one summary (summary.md and summary.json).

Used by the `report` job in .github/workflows/ci.yml. The summary is shown on
the run page and also published to the `ci-results` branch at
results/<branch>/<sha>/ so the result can be read with plain `git fetch`
(the verify-work skill does this when `gh` and an API token are not available).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

# Files copied next to the summary when present (kept small on purpose).
DETAIL_FILES = {
    "api-new-failures.txt": "api",
    "migrations.txt": "api",
    "admin-lint.json": "admin",
    "admin-lint.txt": "admin",
}
# Logs copied only when their step failed: (file, job, step key).
FAILURE_LOGS = [
    ("pytest-output.txt", "api", "pytest"),
    ("admin-build.txt", "admin", "build"),
    ("public-typecheck.txt", "public", "typecheck"),
    ("public-build.txt", "public", "build"),
    ("install.txt", "api", "install"),
    ("install.txt", "admin", "install"),
    ("install.txt", "public", "install"),
]
TAIL_LINES = 300


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def word(outcome: str | None) -> str:
    return {"success": "pass", "failure": "fail", "skipped": "not run", "cancelled": "cancelled"}.get(outcome or "", "not run")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reports", type=Path, required=True, help="downloaded artifacts, one folder per job")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--needs", default="{}", help="toJSON(needs) from the workflow")
    args = parser.parse_args()

    needs = json.loads(args.needs or "{}")
    jobs = {name: (info or {}).get("result", "unknown") for name, info in needs.items()}
    folders = {job: args.reports / f"{job}-results" for job in ("api", "admin", "public")}
    steps = {job: read_json(folder / f"{job}-steps.json") for job, folder in folders.items()}
    tests = read_json(folders["api"] / "api-tests.json")
    lint = read_json(folders["admin"] / "admin-lint-summary.json")

    rows = []
    migrations = read_json(folders["api"] / "migrations-summary.json")
    if migrations.get("crashed"):
        mig_detail = "makemigrations crashed, see migrations.txt"
    elif "pending" in migrations:
        mig_detail = f"{migrations['pending'] - len(migrations['new'])} known on main, {len(migrations['new'])} new"
    else:
        mig_detail = ""
    rows.append(("Migrations up to date", word(steps["api"].get("migrations")), mig_detail))
    if tests and "passed" in tests:
        detail = (
            f"{tests['passed']} passed, {tests['failed']} failed "
            f"({tests['known_failing']} known on main, {len(tests['new_failures'])} new)"
        )
        api_result = "pass" if not tests["new_failures"] and steps["api"].get("results") == "success" else "fail"
    else:
        detail = tests.get("error", "no test report")
        api_result = "fail" if steps["api"] else "not run"
    rows.append(("API tests", api_result, detail))
    if lint and "errors" in lint:
        lint_detail = f"{lint['errors']} errors, {lint['warnings']} warnings ({len(lint['new'])} new vs baseline)"
    else:
        lint_detail = lint.get("error", "no lint report")
    rows.append(("Admin lint", word(steps["admin"].get("lint")), lint_detail))
    rows.append(("Admin build", word(steps["admin"].get("build")), ""))
    rows.append(("Public type check", word(steps["public"].get("typecheck")), ""))
    rows.append(("Public build", word(steps["public"].get("build")), ""))

    all_green = all(result == "success" for result in jobs.values()) and bool(jobs)
    lines = [
        f"## CI results for `{args.branch}` @ `{args.sha[:7]}`",
        "",
        f"Run: {args.run_url}",
        f"Jobs: " + ", ".join(f"{name} {result}" for name, result in sorted(jobs.items())),
        f"Overall: **{'green' if all_green else 'red'}**",
        "",
        "| Check | Result | Details |",
        "| --- | --- | --- |",
        *[f"| {name} | {result} | {detail} |" for name, result, detail in rows],
        "",
        "New failures:",
        *([f"- {item['id']}: {item['reason']}" for item in tests.get("new_failures", [])] or ["- none"]),
        "",
        "New missing migrations:",
        *([f"- {op}" for op in migrations.get("new", [])] or ["- none"]),
        "",
        "New lint problems:",
        *(
            [f"- {p['severity']} {p['file']}:{p['line']} {p['rule']}: {p['message']}" for p in lint.get("new", [])]
            or ["- none"]
        ),
        "",
        "Known failures that now pass:",
        *([f"- {item}" for item in tests.get("known_now_passing", [])] or ["- none"]),
        "",
    ]

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "summary.md").write_text("\n".join(lines))
    (args.out / "summary.json").write_text(
        json.dumps(
            {
                "branch": args.branch,
                "sha": args.sha,
                "run_url": args.run_url,
                "jobs": jobs,
                "green": all_green,
                "steps": steps,
                "tests": tests,
                "lint": lint,
                "migrations": migrations,
                "rows": [{"check": n, "result": r, "details": d} for n, r, d in rows],
            },
            indent=2,
        )
    )

    for name, job in DETAIL_FILES.items():
        source = folders[job] / name
        if source.is_file():
            shutil.copy(source, args.out / name)
    for name, job, step in FAILURE_LOGS:
        source = folders[job] / name
        if source.is_file() and steps[job].get(step) == "failure":
            tail = source.read_text(encoding="utf-8", errors="replace").splitlines()[-TAIL_LINES:]
            (args.out / f"{job}-{name}").write_text("\n".join(tail) + "\n")

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
